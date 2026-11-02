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

    Head headPrivate(String key);

    byte[] read(String key, long maxBytes);

    void put(String key, byte[] bytes, String type);

    /** Stream private canonical bytes without buffering an export-sized object. */
    default java.io.InputStream openPrivate(String key) {
        throw new UnsupportedOperationException("Streaming private reads unavailable");
    }

    default void putFile(String key, java.nio.file.Path file, String type) {
        throw new UnsupportedOperationException("Streaming private writes unavailable");
    }

    void deleteStaging(String key);

    void deletePrivate(String key);

    String download(String key, String name, String type, Duration expiry);
}
