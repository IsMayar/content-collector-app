package com.ayaantrix.collector.attachment.service;

import com.ayaantrix.collector.attachment.entity.Attachment;
import com.ayaantrix.collector.attachment.repository.AttachmentRepository;
import com.ayaantrix.collector.attachment.security.AttachmentAuthorization;
import com.ayaantrix.collector.attachment.storage.*;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.common.error.ApiException;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.*;
import java.util.*;

@Component
public class AttachmentWorker {
    private final AttachmentRepository assets;
    private final AttachmentAuthorization auth;
    private final ClientAccessAuthorization grants;
    private final PrivateObjectStorage storage;
    private final MalwareScanner scanner;
    private final SandboxedImageProcessor images;
    private final AttachmentValidationService validation;
    private final TransactionTemplate tx;
    private final Clock clock;
    private Instant reconciled = Instant.MIN;

    public AttachmentWorker(
            AttachmentRepository assets,
            AttachmentAuthorization auth,
            ClientAccessAuthorization grants,
            PrivateObjectStorage storage,
            MalwareScanner scanner,
            SandboxedImageProcessor images,
            AttachmentValidationService validation,
            PlatformTransactionManager manager,
            Clock clock) {
        this.assets = assets;
        this.auth = auth;
        this.grants = grants;
        this.storage = storage;
        this.scanner = scanner;
        this.images = images;
        this.validation = validation;
        tx = new TransactionTemplate(manager);
        this.clock = clock;
    }

    private boolean eligible(Attachment a) {
        var access = grants.available(a.workspace(), a.project(), a.contact(), false);
        return access.isPresent()
                && access.get().project().state().name().equals("ACTIVE")
                && access.get().workspace().state().name().equals("ACTIVE")
                && auth.visibleItem(a.workspace(), a.project(), a.item())
                        .filter(AttachmentAuthorization::editable)
                        .isPresent();
    }

    public boolean dispatchOne() {
        if (!storage.enabled()) return false;
        Attachment claimed = null;
        for (var candidate : assets.candidates(clock.instant())) {
            claimed =
                    tx.execute(
                            s -> {
                                assets.lockScope(candidate.workspace(), candidate.project());
                                var fresh =
                                        assets.find(
                                                        candidate.workspace(),
                                                        candidate.project(),
                                                        candidate.id())
                                                .orElseThrow();
                                if (!fresh.state().equals("PROCESSING")) return null;
                                if (!eligible(fresh)) {
                                    assets.release(
                                            fresh,
                                            "FAILED",
                                            "ACCESS_OR_PROJECT_CHANGED",
                                            clock.instant());
                                    return null;
                                }
                                return assets.claim(fresh, UUID.randomUUID(), clock.instant());
                            });
            if (claimed != null) break;
        }
        if (claimed == null) return false;
        final Attachment a = claimed;
        try {
            byte[] bytes = storage.read(a.staging(), a.bytes());
            if (bytes.length != a.bytes())
                AttachmentValidationService.invalid(
                        "FILE_SIZE_MISMATCH", "The transferred size changed.");
            validation.verify(bytes, a.declaredType());
            scanner.verify(bytes);
            String base = a.objectKeys().get(a.objectKeys().size() - 3).asText();
            var variants = new LinkedHashMap<String, String>();
            long retained = 0;
            String canonical = base;
            if (validation.image(a.declaredType())) {
                var derived = images.process(bytes);
                storage.put(base + "-working", derived.working(), "image/png");
                storage.put(base + "-thumbnail", derived.thumbnail(), "image/png");
                variants.put("WORKING", base + "-working");
                variants.put("THUMBNAIL", base + "-thumbnail");
                retained = derived.working().length + derived.thumbnail().length;
                if (a.keep()) {
                    storage.put(base, bytes, a.declaredType());
                    variants.put("ORIGINAL", base);
                    retained += bytes.length;
                } else canonical = base + "-working";
            } else {
                storage.put(base, bytes, a.declaredType());
                variants.put("ORIGINAL", base);
                retained = bytes.length;
            }
            String sha =
                    java.util.HexFormat.of()
                            .formatHex(
                                    java.security.MessageDigest.getInstance("SHA-256")
                                            .digest(bytes));
            final long actual = retained;
            final String key = canonical;
            boolean accepted =
                    Boolean.TRUE.equals(
                            tx.execute(
                                    s -> {
                                        assets.lockScope(a.workspace(), a.project());
                                        var fresh =
                                                assets.find(a.workspace(), a.project(), a.id())
                                                        .orElseThrow();
                                        if (!fresh.state().equals("PROCESSING")
                                                || !Objects.equals(fresh.lease(), a.lease()))
                                            return false;
                                        if (!eligible(fresh)) {
                                            assets.release(
                                                    fresh,
                                                    "FAILED",
                                                    "ACCESS_OR_PROJECT_CHANGED",
                                                    clock.instant());
                                            return false;
                                        }
                                        assets.ready(
                                                fresh,
                                                key,
                                                a.declaredType(),
                                                sha,
                                                variants,
                                                actual,
                                                clock.instant());
                                        return true;
                                    }));
            // Never copy a mutable staging key: canonical objects contain only the scanned byte
            // snapshot.
            if (accepted)
                try {
                    storage.deleteStaging(a.staging());
                } catch (RuntimeException ignored) {
                }
        } catch (Exception failure) {
            String code =
                    failure instanceof ClamAvScanner.Infected
                            ? "MALWARE_DETECTED"
                            : failure instanceof ApiException e
                                    ? e.getCode()
                                    : failure instanceof ClamAvScanner.ScanUnavailable
                                            ? "SCANNER_UNAVAILABLE"
                                            : "PROCESSING_UNAVAILABLE";
            boolean permanent =
                    failure instanceof ClamAvScanner.Infected || failure instanceof ApiException;
            tx.executeWithoutResult(
                    s -> {
                        assets.lockScope(a.workspace(), a.project());
                        var fresh = assets.find(a.workspace(), a.project(), a.id()).orElseThrow();
                        if (!fresh.state().equals("PROCESSING")
                                || !Objects.equals(fresh.lease(), a.lease())) return;
                        if (permanent || fresh.attempts() >= 3)
                            assets.release(
                                    fresh,
                                    permanent ? "REJECTED" : "FAILED",
                                    code,
                                    clock.instant());
                        else assets.retry(fresh, code, clock.instant());
                    });
        }
        return true;
    }

    public void cleanup() {
        if (!storage.enabled()) return;
        for (var candidate : assets.cleanup(clock.instant())) {
            var a =
                    tx.execute(
                            s -> {
                                assets.lockScope(candidate.workspace(), candidate.project());
                                var fresh =
                                        assets.find(
                                                        candidate.workspace(),
                                                        candidate.project(),
                                                        candidate.id())
                                                .orElseThrow();
                                if (fresh.state().equals("RESERVED")
                                        && !clock.instant().isBefore(fresh.expires())) {
                                    assets.release(
                                            fresh, "DELETED", "UPLOAD_EXPIRED", clock.instant());
                                    fresh =
                                            assets.find(
                                                            fresh.workspace(),
                                                            fresh.project(),
                                                            fresh.id())
                                                    .orElseThrow();
                                }
                                return fresh;
                            });
            if (clock.instant().isBefore(a.cleanup())) continue;
            try {
                storage.deleteStaging(a.staging());
                var retained = new HashSet<String>();
                if (a.state().equals("READY"))
                    for (var value : a.variants()) retained.add(value.asText());
                for (var key : a.objectKeys())
                    if (!retained.contains(key.asText())) storage.deletePrivate(key.asText());
                tx.executeWithoutResult(
                        s -> {
                            assets.lockScope(a.workspace(), a.project());
                            var fresh =
                                    assets.find(a.workspace(), a.project(), a.id()).orElseThrow();
                            if (fresh.state().equals(a.state()))
                                assets.cleaned(fresh, clock.instant());
                        });
            } catch (RuntimeException ignored) {
            }
        }
        if (reconciled.plus(Duration.ofDays(1)).isBefore(clock.instant())) {
            for (UUID workspace : assets.workspaces())
                tx.executeWithoutResult(s -> assets.reconcile(workspace));
            reconciled = clock.instant();
        }
    }
}
