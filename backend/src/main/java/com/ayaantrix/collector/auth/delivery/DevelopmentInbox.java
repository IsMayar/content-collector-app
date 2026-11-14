package com.ayaantrix.collector.auth.delivery;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/** Local-only delivery sink for the existing encrypted account outbox. */
public final class DevelopmentInbox implements VerificationMailSender {
    private static final Set<String> LOOPBACK = Set.of("127.0.0.1", "localhost", "::1", "[::1]");
    private final Path inbox = Path.of(".local", "auth", "inbox").toAbsolutePath();

    public DevelopmentInbox(Environment environment) {
        if (!environment.acceptsProfiles(Profiles.of("dev"))
                || !LOOPBACK.contains(environment.getProperty("server.address", ""))) {
            throw new IllegalStateException("The development inbox requires a loopback dev server.");
        }
        if (!Files.isDirectory(inbox, LinkOption.NOFOLLOW_LINKS)) {
            throw new IllegalStateException("Initialize the private development inbox before enabling delivery.");
        }
    }

    @Override
    public void send(Message message) {
        URI link = message.actionLink();
        if (link.getHost() == null || !LOOPBACK.contains(link.getHost())) {
            throw new DeliveryFailure(false);
        }
        Path destination = inbox.resolve(message.deliveryId() + ".txt");
        String content = message.purpose() + "\n" + message.recipient() + "\n" + link + "\n";
        try {
            Files.writeString(destination, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException failure) {
            // An I/O failure may have left a partial delivery. Let the outbox hold it for inspection.
            throw new DeliveryFailure(true);
        }
    }
}
