
package com.ayaantrix.collector.common.error;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.List;

@Component
public class ApiProblemFactory {

    public ProblemDetail create(
            HttpStatusCode status,
            String code,
            String title,
            String detail,
            String traceId
    ) {
        ProblemDetail problem =
                ProblemDetail.forStatusAndDetail(
                        status,
                        detail
                );

        problem.setType(URI.create("about:blank"));
        problem.setTitle(title);
        problem.setProperty("code", code);
        problem.setProperty("traceId", traceId);
        problem.setProperty("errors", List.of());

        return problem;
    }
}
