package com.ayaantrix.collector.analytics.service;

import com.ayaantrix.collector.analytics.dto.ActivityDtos.Activity;
import com.ayaantrix.collector.analytics.repository.ActivityRepository;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.repository.ProjectRepository;
import com.ayaantrix.collector.project.security.ProjectAuthorization;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@Transactional
public class ActivityService {
    private final ProjectAuthorization auth;
    private final ProjectRepository projects;
    private final ActivityRepository repo;

    public ActivityService(
            ProjectAuthorization auth, ProjectRepository projects, ActivityRepository repo) {
        this.auth = auth;
        this.projects = projects;
        this.repo = repo;
    }

    public Activity read(UUID w, UUID p, int page, int size) {
        var a = auth.access(w, false);
        auth.readableProject(a, p);
        projects.findByWorkspaceIdAndId(w, p).orElseThrow(ProjectAuthorization::missing);
        if (page < 0 || page > 100000 || size < 1 || size > 100)
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "INVALID_PAGE", "Use a valid activity page and size.");
        return repo.read(w, p, page, size);
    }
}
