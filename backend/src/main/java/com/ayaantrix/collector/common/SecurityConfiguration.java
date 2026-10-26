
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
            CsrfTokenRepository csrfTokenRepository
    ) throws Exception {

        return http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(
                                HttpMethod.GET,
                                "/actuator/health"
                        ).permitAll()
                        .requestMatchers(HttpMethod.GET,"/api/v1/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST,"/api/v1/auth/register","/api/v1/auth/verify-email").permitAll()
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
