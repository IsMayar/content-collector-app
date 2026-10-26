
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

@Configuration(proxyBeanMethods = false)
public class SecurityConfiguration {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SecurityProblemHandler securityProblemHandler
    ) throws Exception {

        return http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(
                                HttpMethod.GET,
                                "/actuator/health"
                        ).permitAll()
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

                // CSRF remains enabled for future
                // cookie-authenticated write requests.
                .build();
    }

    @Bean
    UserDetailsService userDetailsService() {
        // No temporary login access.
        return new InMemoryUserDetailsManager();
    }
}
