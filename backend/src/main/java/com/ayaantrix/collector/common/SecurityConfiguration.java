
package com.ayaantrix.collector.common;

import com.ayaantrix.collector.common.error.SecurityProblemHandler;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

@Configuration(proxyBeanMethods = false)
public class SecurityConfiguration {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SecurityProblemHandler securityProblemHandler,
            CsrfTokenRepository csrfTokenRepository,
            org.springframework.beans.factory.ObjectProvider<com.ayaantrix.collector.auth.security.AccessTokenSecurity> accessSecurity
    ) throws Exception {

        accessSecurity.ifAvailable(security -> security.configure(http,securityProblemHandler));
        return http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(
                                HttpMethod.GET,
                                "/actuator/health"
                        ).permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/auth/register","/api/v1/auth/verify-email",
                                "/api/v1/auth/forgot-password","/api/v1/auth/reset-password",
                                "/api/v1/auth/login","/api/v1/auth/refresh","/api/v1/auth/logout").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects/*/reminder-policy","/api/v1/workspaces/*/projects/*/deliveries").authenticated()
                        .requestMatchers(HttpMethod.PUT,"/api/v1/workspaces/*/projects/*/reminder-policy").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/reminders/preview","/api/v1/workspaces/*/projects/*/reminders/send").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/client/projects/*/notification-preferences").permitAll()
                        .requestMatchers(HttpMethod.PUT,"/api/v1/client/projects/*/notification-preferences").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/webhooks/email").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client/projects/*/sms/verification","/api/v1/client/projects/*/sms/verification/confirm").permitAll()
                        .requestMatchers(HttpMethod.DELETE,"/api/v1/client/projects/*/sms/consent").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/webhooks/twilio/inbound","/api/v1/webhooks/twilio/status").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/me","/api/v1/me/sessions").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/auth/logout-all").authenticated()
                        .requestMatchers(HttpMethod.DELETE,"/api/v1/me/sessions/*").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces","/api/v1/workspaces/*").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/templates","/api/v1/workspaces/*/template-versions/*").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects","/api/v1/workspaces/*/projects/*","/api/v1/workspaces/*/clients").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects/*/contacts","/api/v1/workspaces/*/projects/*/client-preview").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/contacts").authenticated()
                        .requestMatchers(HttpMethod.PATCH,"/api/v1/workspaces/*/clients/*").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects","/api/v1/workspaces/*/clients").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/sections",
                                "/api/v1/workspaces/*/projects/*/sections/*/items","/api/v1/workspaces/*/projects/*/structure/reorder").authenticated()
                        .requestMatchers(HttpMethod.PATCH,"/api/v1/workspaces/*/projects/*/sections/*",
                                "/api/v1/workspaces/*/projects/*/items/*/schema").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces").authenticated()
                        .requestMatchers(HttpMethod.PATCH,"/api/v1/workspaces/*").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/members","/api/v1/workspaces/*/projects/*/assignments").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/members","/api/v1/team-invitations/accept","/api/v1/workspaces/*/ownership-transfer").authenticated()
                        .requestMatchers(HttpMethod.PATCH,"/api/v1/workspaces/*/members/*").authenticated()
                        .requestMatchers(HttpMethod.DELETE,"/api/v1/workspaces/*/members/*","/api/v1/workspaces/*/member-invitations/*","/api/v1/workspaces/*/projects/*/assignments/*").authenticated()
                        .requestMatchers(HttpMethod.PUT,"/api/v1/workspaces/*/projects/*/assignments/*").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/contacts/*/invite").authenticated()
                        .requestMatchers(HttpMethod.DELETE,"/api/v1/workspaces/*/projects/*/contacts/*/access").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client-access/exchange","/api/v1/client-access/request-link","/api/v1/client-access/logout").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/client/projects/*/checklist").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client/projects/*/events").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects/*/activity").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects/*/analytics","/api/v1/workspaces/*/analytics/templates").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/client/projects/*/items/*").permitAll()
                        .requestMatchers(HttpMethod.PUT,"/api/v1/client/projects/*/items/*/answer").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client/projects/*/uploads","/api/v1/client/projects/*/uploads/*/finalize","/api/v1/client/projects/*/assets/*/download").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/client/projects/*/assets/*").permitAll()
                        .requestMatchers(HttpMethod.DELETE,"/api/v1/client/projects/*/uploads/*","/api/v1/client/projects/*/assets/*").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/assets/*/download").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client/projects/*/items/*/submit","/api/v1/client/projects/*/items/*/withdraw").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects/*/review-queue","/api/v1/workspaces/*/projects/*/items/*/revisions","/api/v1/workspaces/*/projects/*/items/*/revisions/*").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/items/*/review-decisions","/api/v1/workspaces/*/projects/*/items/*/comments").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects/*/items/*/comments").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/client/projects/*/items/*/comments").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client/projects/*/items/*/comments").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/publish","/api/v1/workspaces/*/projects/*/pause","/api/v1/workspaces/*/projects/*/resume","/api/v1/workspaces/*/projects/*/complete","/api/v1/workspaces/*/projects/*/reopen","/api/v1/workspaces/*/projects/*/archive","/api/v1/workspaces/*/projects/*/restore","/api/v1/workspaces/*/projects/*/items/*/reopen").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects/*/exports","/api/v1/workspaces/*/projects/*/exports/*").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/exports","/api/v1/workspaces/*/projects/*/exports/*/download").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client/projects/*/items/*/ai-drafts","/api/v1/client/projects/*/ai-drafts/*/accept").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/client/projects/*/ai-drafts/*").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/status-shares").authenticated()
                        .requestMatchers(HttpMethod.DELETE,"/api/v1/workspaces/*/projects/*/status-shares/*").authenticated()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/digest-preferences","/api/v1/workspaces/*/digest-preview").authenticated()
                        .requestMatchers(HttpMethod.PUT,"/api/v1/workspaces/*/digest-preferences").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/status-shares/exchange").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/status-shares/*/counts","/api/v1/status-shares/*/embed").permitAll()
                        .anyRequest().denyAll()
                )

                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)

                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(
                                securityProblemHandler
                        )
                        .accessDeniedHandler(
                                securityProblemHandler
                        )
                )

                .headers(headers -> headers.frameOptions(f -> f.disable()).addHeaderWriter(new com.ayaantrix.collector.visibility.security.ShareFrameHeaders()).referrerPolicy(policy -> policy.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                .csrf(csrf -> csrf.csrfTokenRepository(csrfTokenRepository).ignoringRequestMatchers(request -> "POST".equals(request.getMethod()) && java.util.Set.of(request.getContextPath()+"/api/v1/status-shares/exchange",request.getContextPath()+"/api/v1/webhooks/email",request.getContextPath()+"/api/v1/webhooks/twilio/inbound",request.getContextPath()+"/api/v1/webhooks/twilio/status").contains(request.getRequestURI())))

                // CSRF remains enabled for future
                // cookie-authenticated write requests.
                .build();
    }

    @Bean
    CsrfTokenRepository csrfTokenRepository() {
        var repository = new HttpSessionCsrfTokenRepository();
        repository.setHeaderName("X-XSRF-TOKEN");
        return repository;
    }

    @Bean
    UserDetailsService userDetailsService() {
        // No temporary login access.
        return new InMemoryUserDetailsManager();
    }
}
