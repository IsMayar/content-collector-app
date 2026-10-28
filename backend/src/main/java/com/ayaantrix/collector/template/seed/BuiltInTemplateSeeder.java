package com.ayaantrix.collector.template.seed;

import com.ayaantrix.collector.template.validation.TemplateSchemaValidator;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** One transaction, PostgreSQL transaction advisory lock, append-only deterministic version-one seeds. */
@Component
public class BuiltInTemplateSeeder implements ApplicationRunner {
    public static final String RESOURCE="templates/starter_templates.json";
    private final JdbcTemplate jdbc;
    private final TemplateSchemaValidator validator;
    private final TransactionTemplate transaction;
    BuiltInTemplateSeeder(JdbcTemplate jdbc, TemplateSchemaValidator validator, PlatformTransactionManager manager) {
        this.jdbc=jdbc; this.validator=validator; transaction=new TransactionTemplate(manager);
    }
    @Override public void run(ApplicationArguments args) { seed(); }
    public static UUID templateId(String key) { return stable("template:"+key); }
    public static UUID versionId(String key, int version) { return stable("version:"+key+":"+version); }
    private static UUID stable(String name) {
        return UUID.nameUUIDFromBytes(("com.ayaantrix.collector:builtin:"+name).getBytes(StandardCharsets.UTF_8));
    }
    public List<JsonNode> originals() {
        final String source;
        try (var stream=new ClassPathResource(RESOURCE).getInputStream()) { source=new String(stream.readAllBytes(),StandardCharsets.UTF_8); }
        catch (java.io.IOException missing) { throw new IllegalStateException("Built-in template resource unavailable."); }
        var root=validator.parse(source);
        if (!root.isObject() || root.size()!=2 || !root.path("catalogVersion").isIntegralNumber()
            || root.path("catalogVersion").asInt()!=1 || !root.path("templates").isArray() || root.path("templates").size()!=10)
            throw new IllegalStateException("Unsupported built-in catalog envelope.");
        var definitions=new ArrayList<JsonNode>(); var keys=new HashSet<String>();
        for (var template:root.get("templates")) {
            var definition=validator.validate(template);
            if (!keys.add(definition.get("key").asText()) || !definition.path("version").isIntegralNumber() || definition.path("version").asInt()!=1)
                throw new IllegalStateException("Invalid built-in catalog identity or version.");
            definitions.add(definition);
        }
        return List.copyOf(definitions);
    }
    public void seed() {
        var originals=originals(); // Validate the complete batch before writing any row.
        transaction.executeWithoutResult(status -> {
            jdbc.execute("select pg_advisory_xact_lock(648731920941)");
            for (var d:originals) {
                String key=d.get("key").asText(); UUID id=templateId(key), version=versionId(key,1);
                jdbc.update("""
                    insert into collector.templates(id,template_key,project_type,industry,title,is_builtin,version)
                    values (?,?,?,?,?,true,1) on conflict do nothing
                    """,id,key,d.get("projectType").asText(),d.get("industry").asText(),d.get("title").asText());
                Integer identity=jdbc.queryForObject("""
                    select count(*) from collector.templates where id=? and template_key=? and workspace_id is null
                      and is_builtin and project_type=? and industry=? and title=?
                    """,Integer.class,id,key,d.get("projectType").asText(),d.get("industry").asText(),d.get("title").asText());
                if (identity==null || identity!=1) throw conflict();
                jdbc.update("""
                    insert into collector.template_versions(id,template_id,version_no,schema_version,definition)
                    values (?,?,1,1,?::jsonb) on conflict do nothing
                    """,version,id,d.toString());
                Integer matches=jdbc.queryForObject("""
                    select count(*) from collector.template_versions where id=? and template_id=?
                      and version_no=1 and schema_version=1 and definition=?::jsonb
                    """,Integer.class,version,id,d.toString());
                if (matches==null || matches!=1) throw conflict();
            }
        });
    }
    private static IllegalStateException conflict() {
        return new IllegalStateException("Published built-in catalog conflicts with packaged version. No seed data was overwritten.");
    }
}
