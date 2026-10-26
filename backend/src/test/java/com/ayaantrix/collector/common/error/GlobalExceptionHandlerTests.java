package com.ayaantrix.collector.common.error;

import com.ayaantrix.collector.common.web.RequestTrace;
import com.ayaantrix.collector.common.web.RequestTraceFilter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerTests {
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        var trace = new RequestTrace();
        mvc = MockMvcBuilders.standaloneSetup(new TransportFixture())
                .setControllerAdvice(new GlobalExceptionHandler(new ApiProblemFactory(), trace))
                .addFilters(new RequestTraceFilter(trace)).build();
    }

    @Test
    void applicationErrorPreservesStatusCodeAndSafeMessage() throws Exception {
        problem(mvc.perform(get("/_test/application").header("X-Request-ID", "client-123")),
                409, "VERSION_CONFLICT", "client-123")
                .andExpect(jsonPath("$.detail").value("Reload the latest revision."));
    }

    @Test
    void validationReportsFieldWithoutRejectedValueOrConstraintMessage() throws Exception {
        problem(mvc.perform(post("/_test/body").contentType("application/json")
                .content("{\"name\":\"\"}").header("X-Request-ID", "validation-1")),
                400, "VALIDATION_FAILED", "validation-1")
                .andExpect(jsonPath("$.errors[0].fieldPath").value("name"))
                .andExpect(jsonPath("$.errors[0].message").value("Invalid value."))
                .andExpect(content().string(not(containsString("private-constraint"))));
    }

    @Test
    void malformedJsonIsSafe() throws Exception {
        problem(mvc.perform(post("/_test/body").contentType("application/json")
                .content("{private-payload").header("X-Request-ID", "json-1")),
                400, "MALFORMED_REQUEST", "json-1")
                .andExpect(content().string(not(containsString("private-payload"))));
    }

    @Test
    void unsupportedMethodPreservesAllowHeader() throws Exception {
        problem(mvc.perform(get("/_test/body").header("X-Request-ID", "method-1")),
                405, "METHOD_NOT_ALLOWED", "method-1")
                .andExpect(header().string("Allow", containsString("POST")));
    }

    @Test
    void unsupportedContentType() throws Exception {
        problem(mvc.perform(post("/_test/body").contentType("text/plain").content("private-payload")
                .header("X-Request-ID", "media-1")), 415, "UNSUPPORTED_MEDIA_TYPE", "media-1");
    }

    @Test
    void unacceptableResponseTypeStillReturnsProblemJson() throws Exception {
        problem(mvc.perform(post("/_test/body").contentType("application/json").accept("application/xml")
                .content("{\"name\":\"Valid\"}").header("X-Request-ID", "accept-1")),
                406, "NOT_ACCEPTABLE", "accept-1");
    }

    @Test
    void missingParameter() throws Exception {
        problem(mvc.perform(get("/_test/parameter").header("X-Request-ID", "param-1")),
                400, "MALFORMED_REQUEST", "param-1");
    }

    @Test
    void invalidParameterValueDoesNotLeakInput() throws Exception {
        problem(mvc.perform(get("/_test/parameter").param("count", "private-payload")
                .header("X-Request-ID", "param-2")), 400, "MALFORMED_REQUEST", "param-2")
                .andExpect(content().string(not(containsString("private-payload"))));
    }

    @Test
    void unexpectedExceptionIsRedacted() throws Exception {
        problem(mvc.perform(get("/_test/unexpected").header("X-Request-ID", "error-1")),
                500, "INTERNAL_SERVER_ERROR", "error-1")
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred."))
                .andExpect(content().string(not(containsString("private-secret"))))
                .andExpect(content().string(not(containsString("IllegalStateException"))))
                .andExpect(content().string(not(containsString("stackTrace"))));
    }

    @Test
    void missingRouteAfterMvcDispatchUsesStandard404() throws Exception {
        // Isolated MVC transport test: production security still denies unknown routes.
        problem(mvc.perform(get("/_test/missing").header("X-Request-ID", "missing-1")),
                404, "NOT_FOUND", "missing-1");
    }

    @Test
    void generatedTraceMatchesResponseHeader() throws Exception {
        var result = mvc.perform(get("/_test/unexpected")).andExpect(status().isInternalServerError()).andReturn();
        String id = result.getResponse().getHeader("X-Request-ID");
        org.junit.jupiter.api.Assertions.assertNotNull(id);
        org.junit.jupiter.api.Assertions.assertTrue(id.matches("[A-Za-z0-9_-]{1,64}"));
        org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.traceId").value(id).match(result);
    }

    private ResultActions problem(ResultActions result, int status, String code, String id) throws Exception {
        return result.andExpect(status().is(status))
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.type").value("about:blank"))
                .andExpect(jsonPath("$.title").isNotEmpty())
                .andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.detail").isNotEmpty())
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.errors").isArray())
                .andExpect(header().string("X-Request-ID", id))
                .andExpect(jsonPath("$.traceId").value(id));
    }

    @RestController
    static class TransportFixture {
        record Input(@NotBlank(message = "private-constraint") String name) {}
        @PostMapping(value = "/_test/body", consumes = "application/json", produces = "application/json")
        Map<String, String> body(@Valid @RequestBody Input input) { return Map.of("name", input.name()); }
        @GetMapping("/_test/parameter")
        Map<String, Integer> parameter(@RequestParam("count") int count) { return Map.of("count", count); }
        @GetMapping("/_test/application")
        void application() { throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "Reload the latest revision."); }
        @GetMapping("/_test/unexpected")
        void unexpected() { throw new IllegalStateException("SQL password=private-secret"); }
    }
}
