package com.ayaantrix.collector.common.error;

import org.springframework.http.HttpStatus;

/** Safe, workspace-scoped quota figures; never includes storage keys or provider details. */
public final class StorageQuotaException extends ApiException {
    private final long usedBytes;
    private final long availableBytes;

    public StorageQuotaException(long usedBytes, long availableBytes) {
        super(
                HttpStatus.CONFLICT,
                "STORAGE_QUOTA_EXCEEDED",
                "There is not enough workspace storage for this upload.");
        this.usedBytes = usedBytes;
        this.availableBytes = availableBytes;
    }

    public long usedBytes() {
        return usedBytes;
    }

    public long availableBytes() {
        return availableBytes;
    }
}
