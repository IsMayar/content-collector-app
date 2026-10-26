
package com.ayaantrix.collector.common.error;

import com.ayaantrix.collector.common.web.RequestTrace;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;

@Component
public class SecurityProblemHandler
        implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ApiProblemFactory problemFactory;
    private final RequestTrace requestTrace;
    private final JsonMapper jsonMapper;

    public SecurityProblemHandler(
            ApiProblemFactory problemFactory,
            RequestTrace requestTrace,
            JsonMapper jsonMapper
    ) {
        this.problemFactory = problemFactory;
        this.requestTrace = requestTrace;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception
    ) throws IOException {

        // Preserve T03's default-deny 403 behavior until
        // authentication is implemented in T05.

        writeProblem(request, response);
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException exception
    ) throws IOException {

        writeProblem(request, response);
    }

    private void writeProblem(
            HttpServletRequest request,
            HttpServletResponse response
    ) throws IOException {

        if (response.isCommitted()) {
            return;
        }

        ProblemDetail problem = problemFactory.create(
                HttpStatus.FORBIDDEN,
                "ACCESS_DENIED",
                "Forbidden",
                "You do not have permission to access this resource.",
                requestTrace.getTraceId(request)
        );

        response.setStatus(HttpStatus.FORBIDDEN.value());

        response.setContentType(
                MediaType.APPLICATION_PROBLEM_JSON_VALUE
        );

        response.setCharacterEncoding("UTF-8");

        response.getWriter().write(
                jsonMapper.writeValueAsString(problem)
        );
    }
}
