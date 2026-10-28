
package com.ayaantrix.collector.common.error;

import org.springframework.http.HttpStatusCode;

import java.util.Objects;

public class ApiException extends RuntimeException {

    private final HttpStatusCode status;
    private final String code;
    private final Long currentVersion;

    public ApiException(
            HttpStatusCode status,
            String code,
            String message
    ) {
        this(status,code,message,null);
    }

    public ApiException(HttpStatusCode status,String code,String message,Long currentVersion) {
        super(Objects.requireNonNull(message));
        this.currentVersion=currentVersion;
        this.status = Objects.requireNonNull(status);
        this.code = Objects.requireNonNull(code);
    }

    public HttpStatusCode getStatus() {
        return status;
    }

    public Long getCurrentVersion(){return currentVersion;}

    public String getCode() {
        return code;
    }
}
