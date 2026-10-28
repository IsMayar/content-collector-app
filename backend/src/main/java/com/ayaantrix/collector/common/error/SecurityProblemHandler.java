
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

        // Account identity failures use 401; unrelated closed product routes retain 403.

        writeProblem(request, response, false);
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException exception
    ) throws IOException {

        writeProblem(request, response, true);
    }

    private void writeProblem(
            HttpServletRequest request,
            HttpServletResponse response, boolean denied
    ) throws IOException {

        if (response.isCommitted()) {
            return;
        }

        boolean accountRoute=request.getRequestURI().equals("/api/v1/me") || request.getRequestURI().startsWith("/api/v1/me/sessions") || request.getRequestURI().equals("/api/v1/auth/logout-all");
        String path=request.getRequestURI(),method=request.getMethod();
        boolean workspaceRoute=(path.equals("/api/v1/workspaces") && java.util.List.of("GET","POST").contains(method))
            || (path.matches("/api/v1/workspaces/[^/]+") && java.util.List.of("GET","PATCH").contains(method));
        boolean catalogRoute=method.equals("GET") && (path.matches("/api/v1/workspaces/[^/]+/templates")
            || path.matches("/api/v1/workspaces/[^/]+/template-versions/[^/]+"));
        boolean unauthorized=!denied && (accountRoute || workspaceRoute || catalogRoute || request.getHeader("Authorization")!=null);
        ProblemDetail problem = problemFactory.create(
                unauthorized?HttpStatus.UNAUTHORIZED:HttpStatus.FORBIDDEN,
                unauthorized?"INVALID_CREDENTIALS":"ACCESS_DENIED",
                unauthorized?"Unauthorized":"Forbidden",
                unauthorized?"Your session is unavailable. Sign in again.":"You do not have permission to access this resource.",
                requestTrace.getTraceId(request)
        );

        response.setStatus(unauthorized?401:403);
        if(unauthorized)response.setHeader("WWW-Authenticate","Bearer");
        response.setHeader("Cache-Control","no-store");

        response.setContentType(
                MediaType.APPLICATION_PROBLEM_JSON_VALUE
        );

        response.setCharacterEncoding("UTF-8");

        response.getWriter().write(
                jsonMapper.writeValueAsString(problem)
        );
    }
}
