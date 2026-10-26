
package com.ayaantrix.collector.common.error;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.net.URI;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ApiProblemFactoryTests {

    private final ApiProblemFactory factory =
            new ApiProblemFactory();

    @Test
    void createsStandardNotFoundProblem() {

        ProblemDetail problem = factory.create(
                HttpStatus.NOT_FOUND,
                "PROJECT_NOT_FOUND",
                "Not Found",
                "Project not found.",
                "test-trace-123"
        );

        assertEquals(404, problem.getStatus());

        assertEquals(
                URI.create("about:blank"),
                problem.getType()
        );

        assertEquals(
                "Not Found",
                problem.getTitle()
        );

        assertEquals(
                "Project not found.",
                problem.getDetail()
        );

        assertNotNull(problem.getProperties());

        assertEquals(
                "PROJECT_NOT_FOUND",
                problem.getProperties().get("code")
        );

        assertEquals(
                "test-trace-123",
                problem.getProperties().get("traceId")
        );

        assertEquals(
                List.of(),
                problem.getProperties().get("errors")
        );
    }

    @Test
    void createsInternalServerErrorProblem() {

        ProblemDetail problem = factory.create(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_SERVER_ERROR",
                "Internal Server Error",
                "An unexpected error occurred.",
                "test-trace-456"
        );

        assertEquals(500, problem.getStatus());

        assertEquals(
                "INTERNAL_SERVER_ERROR",
                problem.getProperties().get("code")
        );

        assertEquals(
                "test-trace-456",
                problem.getProperties().get("traceId")
        );
    }

    @Test
    void createsValidationProblem() {

        ProblemDetail problem = factory.create(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "Validation Failed",
                "One or more fields are invalid.",
                "test-trace-789"
        );

        assertEquals(400, problem.getStatus());

        assertEquals(
                "VALIDATION_FAILED",
                problem.getProperties().get("code")
        );

        assertEquals(
                List.of(),
                problem.getProperties().get("errors")
        );
    }
}
