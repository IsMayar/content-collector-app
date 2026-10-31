
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
                        .requestMatchers(HttpMethod.GET,"/api/v1/client/projects/*/items/*").permitAll()
                        .requestMatchers(HttpMethod.PUT,"/api/v1/client/projects/*/items/*/answer").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client/projects/*/uploads","/api/v1/client/projects/*/uploads/*/finalize","/api/v1/client/projects/*/assets/*/download").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/client/projects/*/assets/*").permitAll()
                        .requestMatchers(HttpMethod.DELETE,"/api/v1/client/projects/*/uploads/*","/api/v1/client/projects/*/assets/*").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/workspaces/*/projects/*/assets/*/download").authenticated()
                        .requestMatchers(HttpMethod.POST,"/api/v1/client/projects/*/items/*/submit","/api/v1/client/projects/*/items/*/withdraw").permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/workspaces/*/projects/*/review-queue","/api/v1/workspaces/*/projects/*/items/*/revisions","/api/v1/workspaces/*/projects/*/items/*/revisions/*").authenticated()
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

                .headers(headers -> headers.referrerPolicy(policy -> policy.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                .csrf(csrf -> csrf.csrfTokenRepository(csrfTokenRepository))

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
