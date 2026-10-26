package com.ayaantrix.collector.common.web;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class RequestTraceFilterTests {
    private final RequestTrace trace = new RequestTrace();
    private final RequestTraceFilter filter = new RequestTraceFilter(trace);

    @AfterEach
    void clearContext() { MDC.clear(); }

    @Test
    void generatesStableRequestIdAndCleansLoggingContext() throws Exception {
        var request = new MockHttpServletRequest();
        var response = new MockHttpServletResponse();
        MDC.put("other", "preserved");
        filter.doFilter(request, response, (req, res) -> {
            assertEquals(trace.getTraceId(request), MDC.get("traceId"));
            assertEquals(trace.getTraceId(request), response.getHeader("X-Request-ID"));
        });
        assertNull(MDC.get("traceId"));
        assertEquals("preserved", MDC.get("other"));
        assertEquals(trace.getTraceId(request), trace.getTraceId(request));
        assertNotEquals(trace.getTraceId(request), trace.getTraceId(new MockHttpServletRequest()));
    }

    @Test
    void acceptsConstrainedClientId() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", "Client_ID-123");
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> assertEquals("Client_ID-123", MDC.get("traceId")));
        assertEquals("Client_ID-123", response.getHeader("X-Request-ID"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "has spaces", "bad\r\nheader", "one,two", "<script>",
            "12345678901234567890123456789012345678901234567890123456789012345"})
    void replacesUnsafeOrOversizedId(String supplied) throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", supplied);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> {});
        String id = response.getHeader("X-Request-ID");
        assertNotEquals(supplied, id);
        assertTrue(id.matches("[A-Za-z0-9_-]{1,64}"));
        assertEquals(id, trace.getTraceId(request));
        assertNull(MDC.get("traceId"));
    }

    @Test
    void rejectsAmbiguousDuplicateHeaders() {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", "first");
        request.addHeader("X-Request-ID", "second");
        assertNotEquals("first", trace.getTraceId(request));
        assertNotEquals("second", trace.getTraceId(request));
    }

    @Test
    void restoresPreviousContextEvenWhenChainFails() {
        MDC.put("traceId", "outer-trace");
        assertThrows(ServletException.class, () -> filter.doFilter(new MockHttpServletRequest(),
                new MockHttpServletResponse(), (req, res) -> { throw new ServletException("failure"); }));
        assertEquals("outer-trace", MDC.get("traceId"));
    }

    @Test
    void asyncAndErrorDispatchKeepOriginalIdAndCleanContext() throws Exception {
        var request = new MockHttpServletRequest();
        String id = trace.getTraceId(request);
        for (var type : new DispatcherType[] {DispatcherType.REQUEST, DispatcherType.ASYNC, DispatcherType.ERROR}) {
            request.setDispatcherType(type);
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, res) -> assertEquals(id, MDC.get("traceId")));
            assertEquals(id, response.getHeader("X-Request-ID"));
            assertNull(MDC.get("traceId"));
        }
    }
}
