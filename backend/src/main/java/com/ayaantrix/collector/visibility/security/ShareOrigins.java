package com.ayaantrix.collector.visibility.security;

import com.ayaantrix.collector.common.error.ApiException;

import org.springframework.http.HttpStatus;

import java.net.URI;
import java.util.*;

public final class ShareOrigins {
    private ShareOrigins() {}

    public static List<String> validate(List<String> input) {
        if (input == null || input.size() > 10) throw invalid();
        var result = new TreeSet<String>();
        for (String raw : input)
            try {
                if (raw == null
                        || raw.length() > 255
                        || raw.chars().anyMatch(c -> c <= 32 || c >= 127)) throw invalid();
                var u = URI.create(raw);
                if (!"https".equals(u.getScheme())
                        || u.getHost() == null
                        || u.getUserInfo() != null
                        || u.getRawQuery() != null
                        || u.getRawFragment() != null
                        || !Set.of("", "/").contains(u.getRawPath())
                        || u.getPort() == 0
                        || u.getPort() > 65535) throw invalid();
                result.add(
                        "https://"
                                + u.getHost().toLowerCase(Locale.ROOT)
                                + (u.getPort() < 0 || u.getPort() == 443 ? "" : ":" + u.getPort()));
            } catch (IllegalArgumentException ex) {
                throw invalid();
            }
        return List.copyOf(result);
    }

    private static ApiException invalid() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_EMBED_ORIGIN",
                "Use up to ten exact HTTPS origins, without paths, credentials or wildcards.");
    }
}
