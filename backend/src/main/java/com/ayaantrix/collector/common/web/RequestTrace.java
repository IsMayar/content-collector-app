package com.ayaantrix.collector.common.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.UUID;
import java.util.regex.Pattern;

@Component
public class RequestTrace {
    private static final Pattern VALID_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    public String getTraceId(HttpServletRequest request) {
        Object existing = request.getAttribute(RequestTraceFilter.TRACE_ID_ATTRIBUTE);
        if (existing instanceof String id && isValid(id)) {
            return id;
        }
        var headers = Collections.list(request.getHeaders(RequestTraceFilter.TRACE_ID_HEADER));
        String id = headers.size() == 1 && isValid(headers.getFirst())
                ? headers.getFirst() : UUID.randomUUID().toString();
        request.setAttribute(RequestTraceFilter.TRACE_ID_ATTRIBUTE, id);
        return id;
    }

    private boolean isValid(String id) {
        return id != null && VALID_ID.matcher(id).matches();
    }
}
