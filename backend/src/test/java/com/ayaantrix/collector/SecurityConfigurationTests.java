package com.ayaantrix.collector;

import java.util.Map;
import com.ayaantrix.collector.common.SecurityConfiguration;
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

// Tests the request boundary independently; the container test checks real Actuator health.
@WebMvcTest(SecurityConfigurationTests.HealthStub.class)
@Import({SecurityConfiguration.class, SecurityConfigurationTests.HealthStub.class})
class SecurityConfigurationTests {
    @Autowired MockMvc mvc;

    @Test
    void onlyExactHealthGetIsPublic() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mvc.perform(get("/actuator/health/db")).andExpect(status().isForbidden());
        mvc.perform(get("/actuator/env")).andExpect(status().isForbidden());
        mvc.perform(get("/login")).andExpect(status().isForbidden());
        mvc.perform(post("/actuator/health").with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser
    void evenAnAuthenticatedPrincipalHasNoProductAccessYet() throws Exception {
        mvc.perform(get("/api/v1/projects")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/projects").with(csrf())).andExpect(status().isForbidden());
    }

    @RestController
    static class HealthStub {
        @GetMapping("/actuator/health")
        Map<String, String> health() { return Map.of("status", "UP"); }
    }
}
