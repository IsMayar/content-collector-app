package com.ayaantrix.collector.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestTraceFilter extends OncePerRequestFilter {
    public static final String TRACE_ID_ATTRIBUTE = RequestTraceFilter.class.getName() + ".TRACE_ID";
    public static final String TRACE_ID_HEADER = "X-Request-ID";
    private final RequestTrace requestTrace;

    public RequestTraceFilter(RequestTrace requestTrace) {
        this.requestTrace = requestTrace;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String traceId = requestTrace.getTraceId(request);
        response.setHeader(TRACE_ID_HEADER, traceId);
        String previous = MDC.get("traceId");
        try {
            MDC.put("traceId", traceId);
            chain.doFilter(request, response);
        } finally {
            if (previous == null) MDC.remove("traceId");
            else MDC.put("traceId", previous);
        }
    }

    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        return false;
    }

    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        return false;
    }

    @Override
    protected void doFilterNestedErrorDispatch(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        doFilterInternal(request, response, chain);
    }
}
