package com.ayaantrix.collector.clientaccess.service;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.project.service.ProjectContentPresentation;
import com.ayaantrix.collector.project.dto.ProjectClientDtos.Preview;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
@Service @Transactional
public class ClientPortalService {
 private final ClientAccessAuthorization auth;private final ProjectContentPresentation presentation;
 public ClientPortalService(ClientAccessAuthorization auth,ProjectContentPresentation presentation){this.auth=auth;this.presentation=presentation;}
 public Map<String,Object> checklist(String cookie,UUID project){var access=auth.require(cookie,project);Preview p=presentation.present(access.project(),access.workspace().name());return Map.of("project",p.project(),"sections",p.sections(),"progress",p.progress(),"capabilities",Map.of("canRespond",false));}
}
