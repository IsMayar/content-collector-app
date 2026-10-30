package com.ayaantrix.collector.common.error;

import com.ayaantrix.collector.common.web.RequestTrace;
import com.ayaantrix.collector.common.web.RequestTraceFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final ApiProblemFactory problemFactory;
    private final RequestTrace requestTrace;

    public GlobalExceptionHandler(ApiProblemFactory problemFactory, RequestTrace requestTrace) {
        this.problemFactory = problemFactory;
        this.requestTrace = requestTrace;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Object> handleApiException(ApiException exception, HttpServletRequest request) {
        var status = exception.getStatus();
        // ApiException messages are deliberately authored, client-safe messages.
        var problem = problemFactory.create(status, exception.getCode(), title(status),
                exception.getMessage(), requestTrace.getTraceId(request));
        if(exception.getCurrentVersion()!=null)problem.setProperty("currentVersion",exception.getCurrentVersion());
        if(!exception.getErrors().isEmpty())problem.setProperty("errors",exception.getErrors());
        var headers = new HttpHeaders();
        if (status.value() == 429 && "RATE_LIMITED".equals(exception.getCode())) {
            headers.set(HttpHeaders.RETRY_AFTER, "60");
        }
        return response(status, headers, problem);
    }

    // Preserve Spring MVC's status and protocol headers (for example Allow on 405),
    // while replacing framework exception details with bounded, client-safe copy.
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body,
            HttpHeaders headers, HttpStatusCode status, WebRequest webRequest) {
        var servletRequest = (ServletWebRequest) webRequest;
        if (servletRequest.getResponse() != null && servletRequest.getResponse().isCommitted()) {
            return null;
        }
        String code;
        String detail;
        if (exception instanceof MethodArgumentNotValidException) {
            code = "VALIDATION_FAILED";
            detail = "One or more fields are invalid.";
        } else {
            code = switch (status.value()) {
                case 400 -> "MALFORMED_REQUEST";
                case 404 -> "NOT_FOUND";
                case 405 -> "METHOD_NOT_ALLOWED";
                case 406 -> "NOT_ACCEPTABLE";
                case 413 -> "PAYLOAD_TOO_LARGE";
                case 415 -> "UNSUPPORTED_MEDIA_TYPE";
                case 503 -> "SERVICE_UNAVAILABLE";
                default -> status.is5xxServerError() ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED";
            };
            detail = switch (status.value()) {
                case 400 -> "The request is missing required input or contains an invalid value.";
                case 404 -> "The requested resource was not found.";
                case 405 -> "This HTTP method is not supported for this resource.";
                case 406 -> "The requested response media type is not supported.";
                case 413 -> "The request body is too large.";
                case 415 -> "The request media type is not supported.";
                case 503 -> "The service is temporarily unavailable.";
                default -> "The request could not be completed.";
            };
        }
        var problem = problemFactory.create(status, code, title(status), detail,
                requestTrace.getTraceId(servletRequest.getRequest()));
        if (exception instanceof MethodArgumentNotValidException validation) {
            List<Map<String, String>> errors = validation.getBindingResult().getFieldErrors().stream()
                    .map(error -> Map.of("fieldPath", error.getField(), "message", "Invalid value."))
                    .distinct()
                    .sorted(Comparator.comparing(error -> error.get("fieldPath")))
                    .toList();
            problem.setProperty("errors", errors);
        }
        return response(status, headers, problem);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpected(Exception exception, HttpServletRequest request) {
        String traceId = requestTrace.getTraceId(request);
        // Exception messages/causes can contain SQL, credentials or raw customer input.
        log.error("Unexpected API error. traceId={}", traceId);
        var problem = problemFactory.create(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR",
                "Internal Server Error", "An unexpected error occurred.", traceId);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, new HttpHeaders(), problem);
    }

    private ResponseEntity<Object> response(HttpStatusCode status, HttpHeaders original, ProblemDetail problem) {
        var headers = new HttpHeaders();
        headers.putAll(original);
        headers.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        headers.set(RequestTraceFilter.TRACE_ID_HEADER, (String) problem.getProperties().get("traceId"));
        return new ResponseEntity<>(problem, headers, status);
    }

    private String title(HttpStatusCode status) {
        HttpStatus known = HttpStatus.resolve(status.value());
        return known != null ? known.getReasonPhrase() : "Request Failed";
    }
}
