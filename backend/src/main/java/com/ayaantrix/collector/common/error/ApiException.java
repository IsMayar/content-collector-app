
package com.ayaantrix.collector.common.error;

import org.springframework.http.HttpStatusCode;

import java.util.Objects;

public class ApiException extends RuntimeException {

    private final HttpStatusCode status;
    private final String code;

    public ApiException(
            HttpStatusCode status,
            String code,
            String message
    ) {
        super(Objects.requireNonNull(message));
        this.status = Objects.requireNonNull(status);
        this.code = Objects.requireNonNull(code);
    }

    public HttpStatusCode getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
