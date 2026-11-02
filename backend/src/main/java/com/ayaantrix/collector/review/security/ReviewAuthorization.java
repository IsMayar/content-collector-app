package com.ayaantrix.collector.review.security;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.repository.ProjectRepository;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

import java.util.UUID;

@Component
@Transactional(propagation = Propagation.MANDATORY)
public class ReviewAuthorization {
    private final ProjectAuthorization auth;
    private final ProjectRepository projects;

    public ReviewAuthorization(ProjectAuthorization auth, ProjectRepository projects) {
        this.auth = auth;
        this.projects = projects;
    }

    public WorkspaceAuthorization.Access require(UUID w, UUID p, boolean decision, boolean write) {
        var a = auth.access(w, false);
        auth.readableProject(a, p);
        var project = projects.lockForStructure(w, p).orElseThrow(ProjectAuthorization::missing);
        if (project.state().name().equals("DELETION_PENDING")) throw ProjectAuthorization.missing();
        if (decision && !auth.permissions(a, p, false).canReview())
            throw new ApiException(
                    HttpStatus.FORBIDDEN, "REVIEW_FORBIDDEN", "Review permission is required.");
        if (write) {
            auth.writable(a);
            if (!java.util.Set.of("ACTIVE","PAUSED").contains(project.state().name()))
                throw new ApiException(
                        HttpStatus.CONFLICT, "READ_ONLY", "This project is read-only.");
        }
        return a;
    }
}
