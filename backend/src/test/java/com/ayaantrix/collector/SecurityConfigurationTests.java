
package com.ayaantrix.collector;

import java.util.Map;

import com.ayaantrix.collector.common.SecurityConfiguration;
import com.ayaantrix.collector.common.error.ApiProblemFactory;
import com.ayaantrix.collector.common.error.SecurityProblemHandler;
import com.ayaantrix.collector.common.web.RequestTrace;
import com.ayaantrix.collector.common.web.RequestTraceFilter;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

// Tests the request boundary independently;
// the container test checks real Actuator health.
@WebMvcTest(SecurityConfigurationTests.HealthStub.class)
@Import({
    SecurityConfiguration.class,
    SecurityConfigurationTests.HealthStub.class,
    ApiProblemFactory.class,
    RequestTrace.class,
    RequestTraceFilter.class,
    SecurityProblemHandler.class
})
class SecurityConfigurationTests {

    @Autowired
    MockMvc mvc;

    @Test
    void onlyExactHealthGetIsPublic() throws Exception {

        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());

        mvc.perform(get("/actuator/health/db"))
                .andExpect(status().isForbidden());

        mvc.perform(get("/actuator/env"))
                .andExpect(status().isForbidden());

        mvc.perform(get("/login"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/actuator/health").with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser
    void evenAnAuthenticatedPrincipalHasNoProductAccessYet()
            throws Exception {

        mvc.perform(get("/api/v1/projects"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/projects").with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    void protectedEndpointsReturnStandardProblemJson()
            throws Exception {

        mvc.perform(get("/api/v1/projects"))
                .andExpect(status().isForbidden())
                .andExpect(
                        content().contentTypeCompatibleWith(
                                "application/problem+json"
                        )
                )
                .andExpect(
                        jsonPath("$.status").value(403)
                )
                .andExpect(
                        jsonPath("$.code").value(
                                "ACCESS_DENIED"
                        )
                )
                .andExpect(
                        jsonPath("$.traceId").isNotEmpty()
                );
    }

    @Test
    void csrfRejectionsUseProblemJsonAndMatchingTrace() throws Exception {
        for (var request : java.util.List.of(post("/actuator/health"),
                post("/actuator/health").with(csrf().useInvalidToken()))) {
            mvc.perform(request.header("X-Request-ID", "csrf-test"))
                    .andExpect(status().isForbidden())
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"))
                    .andExpect(jsonPath("$.errors").isArray())
                    .andExpect(jsonPath("$.traceId").value("csrf-test"))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                            .string("X-Request-ID", "csrf-test"));
        }
    }

    @Test
    void missingRoutesRemainProtectedAndUnsafeTraceIsReplaced() throws Exception {
        var result = mvc.perform(get("/api/v1/no-such-route").header("X-Request-ID", "unsafe trace"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED")).andReturn();
        String id = result.getResponse().getHeader("X-Request-ID");
        org.junit.jupiter.api.Assertions.assertNotNull(id);
        org.junit.jupiter.api.Assertions.assertNotEquals("unsafe trace", id);
        jsonPath("$.traceId").value(id).match(result);
    }

    @Test
    @WithMockUser
    void authenticatedDenialUsesStandardProblem() throws Exception {
        mvc.perform(get("/api/v1/no-such-route").header("X-Request-ID", "denied-1"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.traceId").value("denied-1"))
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @RestController
    static class HealthStub {

        @GetMapping("/actuator/health")
        Map<String, String> health() {
            return Map.of("status", "UP");
        }
    }
}
