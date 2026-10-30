package com.ayaantrix.collector.project.service;

import com.ayaantrix.collector.auth.security.EmailAddresses;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.dto.ProjectClientDtos.*;
import com.ayaantrix.collector.project.dto.ProjectDtos;
import com.ayaantrix.collector.project.entity.ProjectContact;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import jakarta.validation.Validator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Service @Transactional
public class ProjectClientService {
    // Pilot maximum matches the specification's default grant lifetime. No reusable token is issued.
    private static final Duration MAX_GRANT=Duration.ofDays(90);
    private final ProjectAuthorization authorization;
    private final ProjectRepository projects;
    private final ProjectCustomerRepository customers;
    private final ProjectContactRepository contacts;
    private final ProjectStructureRepository structures;
    private final Validator validator;
    private final Clock clock;
    private final ProjectContentPresentation presentation;
    ProjectClientService(ProjectAuthorization authorization,ProjectRepository projects,ProjectCustomerRepository customers,
            ProjectContactRepository contacts,ProjectStructureRepository structures,Validator validator,Clock clock,ProjectContentPresentation presentation) {
        this.presentation=presentation;
        this.authorization=authorization;this.projects=projects;this.customers=customers;this.contacts=contacts;
        this.structures=structures;this.validator=validator;this.clock=clock;
    }
    public ProjectDtos.Customer updateCustomer(UUID workspace,UUID id,CustomerPatch input) {
        var access=authorization.access(workspace,true);authorization.writable(access);valid(input);
        var customer=customers.findByWorkspaceIdAndId(workspace,id).orElseThrow(ProjectAuthorization::missing);
        if(input.expectedVersion().longValue()!=customer.version().longValue())
            throw new ApiException(HttpStatus.CONFLICT,"VERSION_CONFLICT","The customer changed. Reload before retrying.",customer.version());
        if(input.businessName()==null || input.businessName().isBlank())throw invalid();
        customer.rename(input.businessName().strip(),clock.instant());customers.saveAndFlush(customer);
        return new ProjectDtos.Customer(customer.id(),customer.businessName(),customer.contactName(),customer.email(),customer.version());
    }
    public List<Contact> contacts(UUID workspace,UUID projectId) {
        var access=authorization.access(workspace,false);authorization.readableProject(access);
        projects.findByWorkspaceIdAndId(workspace,projectId).orElseThrow(ProjectAuthorization::missing);
        return contacts.findByWorkspaceIdAndProjectIdOrderByNameAscIdAsc(workspace,projectId).stream().map(ProjectClientService::contact).toList();
    }
    public Contact createContact(UUID workspace,UUID projectId,ContactCreate input) {
        var access=authorization.access(workspace,true);authorization.writable(access);valid(input);
        var project=projects.lockForStructure(workspace,projectId).orElseThrow(ProjectAuthorization::missing);
        if(!project.structureEditable())throw new ApiException(HttpStatus.CONFLICT,"READ_ONLY","This project cannot change client contacts in its current state.");
        customers.findByWorkspaceIdAndId(workspace,input.clientId()).orElseThrow(ProjectAuthorization::missing);
        if(!project.clientId().equals(input.clientId()))throw ProjectAuthorization.missing();
        var now=clock.instant();
        if(!input.accessExpiresAt().isAfter(now) || input.accessExpiresAt().isAfter(now.plus(MAX_GRANT)))throw invalid();
        String email=EmailAddresses.normalize(input.email());
        if(email.chars().anyMatch(Character::isWhitespace))throw invalid();
        if(contacts.existsByWorkspaceIdAndProjectIdAndEmail(workspace,projectId,email))
            throw new ApiException(HttpStatus.CONFLICT,"CONTACT_EXISTS","This project already has a contact with that email address.");
        return contact(contacts.saveAndFlush(new ProjectContact(workspace,projectId,input.clientId(),input.name().strip(),email,input.accessExpiresAt(),now)));
    }
    public Preview preview(UUID workspace,UUID id) {
        var access=authorization.access(workspace,false);authorization.readableProject(access);
        // A locked coherent projection; no dirty entity, audit, answer, session or token writes.
        var project=projects.lockForStructure(workspace,id).orElseThrow(ProjectAuthorization::missing);
        return presentation.present(project,access.workspace().name());
    }

    private static Contact contact(ProjectContact c){return new Contact(c.id(),c.name(),c.email(),c.state(),c.timezone(),c.accessExpiresAt(),c.emailRemindersEnabled(),c.accessInitializedAt());}
    private void valid(Object input){if(input==null || !validator.validate(input).isEmpty())throw invalid();}
    private static ApiException invalid(){return new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Client contact request fields are invalid. Grant expiry must be within the next 90 days.");}
}
