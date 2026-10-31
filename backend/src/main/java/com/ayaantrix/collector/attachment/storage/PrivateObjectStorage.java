package com.ayaantrix.collector.attachment.storage;

import java.time.Duration;
import java.util.*;

public interface PrivateObjectStorage {
    record Signed(String url, Map<String, String> headers) {
        @Override
        public String toString() {
            return "SignedObject[redacted]";
        }
    }

    record Head(long bytes, String contentType) {}

    boolean enabled();

    Signed upload(String key, long bytes, String type, UUID asset, Duration expiry);

    Head head(String key);

    byte[] read(String key, long maxBytes);

    void put(String key, byte[] bytes, String type);

    void deleteStaging(String key);

    void deletePrivate(String key);

    String download(String key, String name, String type, Duration expiry);
}
