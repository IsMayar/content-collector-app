package com.ayaantrix.collector.template;

import com.ayaantrix.collector.template.validation.TemplateSchemaValidator;
import com.ayaantrix.collector.template.validation.TemplateSchemaValidator.InvalidTemplate;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.*;
import java.nio.file.*;
import java.util.*;
import java.util.function.Consumer;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;

class TemplateSchemaValidatorTests {
    static final TemplateSchemaValidator validator=new TemplateSchemaValidator();
    static JsonNode catalog() throws Exception {
        try(var stream=TemplateSchemaValidatorTests.class.getResourceAsStream("/templates/starter_templates.json")) {
            return validator.parse(new String(stream.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
        }
    }
    static ObjectNode sample() throws Exception { return (ObjectNode)catalog().get("templates").get(0).deepCopy(); }
    static ObjectNode item(ObjectNode t) {return (ObjectNode)t.at("/sections/0/items/0");}
    static ObjectNode validation(ObjectNode t) {return (ObjectNode)item(t).get("validation");}
    static Stream<Arguments> originals() throws Exception {
        var result=new ArrayList<Arguments>(); for(var t:catalog().get("templates"))result.add(Arguments.of(t.get("key").asText(),t));return result.stream();
    }
    @ParameterizedTest @MethodSource("originals") void everyOriginalValidatesWithoutLoss(String key,JsonNode source) {
        var copy=validator.validate(source);assertThat(copy).isEqualTo(source).isNotSameAs(source);
        ((ObjectNode)copy).put("title","changed independent copy");assertThat(source.get("title").asText()).isNotEqualTo("changed independent copy");
    }
    @Test void packagedResourceIsByteForByteOriginalAndExactlyTenTemplates() throws Exception {
        byte[] original=Files.readAllBytes(Path.of("../docs/spec/starter_templates.json"));
        try(var stream=getClass().getResourceAsStream("/templates/starter_templates.json")){assertThat(stream.readAllBytes()).containsExactly(original);}
        var all=catalog().get("templates");assertThat(all.size()).isEqualTo(10);
        assertThat(Stream.iterate(0,i->i<all.size(),i->i+1).map(i->all.get(i).get("projectType").asText()).toList())
            .containsExactly("WEBSITE","WEBSITE","WEBSITE","WEBSITE","WEBSITE","WEBSITE","WEBSITE","WEBSITE","WEB_APP","MOBILE_APP");
        int sections=0,items=0;for(var t:all)for(var s:t.get("sections")){sections++;items+=s.get("items").size();}
        assertThat(sections).isEqualTo(68);assertThat(items).isEqualTo(220);
    }
    record Mutation(String name, Consumer<ObjectNode> change) {public String toString(){return name;}}
    static Mutation bad(String name,Consumer<ObjectNode> change){return new Mutation(name,change);}
    static Stream<Mutation> invalid() {
        return Stream.of(
            bad("missing title",t->t.remove("title")),bad("null title",t->t.putNull("title")),bad("blank title",t->t.put("title"," ")),
            bad("overlong title",t->t.put("title","x".repeat(161))),bad("missing industry",t->t.remove("industry")),bad("blank key",t->t.put("key","")),
            bad("invalid key",t->t.put("key","a b")),bad("unknown metadata",t->t.put("defaultValue","discarding me would lose metadata")),
            bad("unknown project type",t->t.put("projectType","NATIVE")),bad("wrong project type JSON",t->t.put("projectType",1)),
            bad("missing schema",t->t.remove("schemaVersion")),bad("unsupported schema",t->t.put("schemaVersion",2)),bad("string schema",t->t.put("schemaVersion","1")),
            bad("fractional version",t->t.put("version",1.5)),bad("nonpositive version",t->t.put("version",0)),
            bad("section not array",t->t.putObject("sections")),bad("no sections",t->t.putArray("sections")),
            bad("section not object",t->((ArrayNode)t.get("sections")).set(0,StringNode.valueOf("invalid"))),
            bad("duplicate section key",t->((ObjectNode)t.at("/sections/1")).put("key","home")),
            bad("too many sections",t->{var a=(ArrayNode)t.get("sections");while(a.size()<31)a.add(a.get(0).deepCopy());}),
            bad("empty section items",t->((ObjectNode)t.at("/sections/0")).putArray("items")),
            bad("too many section items",t->{var a=(ArrayNode)t.at("/sections/0/items");while(a.size()<51)a.add(a.get(0).deepCopy());}),
            bad("item not object",t->((ArrayNode)t.at("/sections/0/items")).set(0,StringNode.valueOf("bad"))),
            bad("duplicate item key in another section",t->((ObjectNode)t.at("/sections/1/items/0")).put("key","home.headline")),
            bad("unknown field",t->item(t).put("type","NUMBER")),bad("missing label",t->item(t).remove("label")),
            bad("missing instructions",t->item(t).remove("instructions")),bad("example wrong JSON",t->item(t).put("example",true)),
            bad("missing required flag",t->item(t).remove("required")),bad("required coercion",t->item(t).put("required","true")),
            bad("enabled wrong JSON",t->item(t).put("enabled",1)),bad("no validation",t->item(t).remove("validation")),
            bad("unknown constraint",t->validation(t).put("regex",".*")),bad("max length missing",t->validation(t).remove("maxLength")),
            bad("short text cap",t->validation(t).put("maxLength",201)),bad("long text cap",t->((ObjectNode)t.at("/sections/0/items/1/validation")).put("maxLength",10001)),
            bad("negative minimum",t->validation(t).put("minLength",-1)),bad("inverted bounds",t->validation(t).put("minLength",201)),
            bad("string max",t->validation(t).put("maxLength","200")),bad("format unknown",t->validation(t).put("format","phone")),
            bad("URL unsafe scheme",t->{item(t).put("type","URL");item(t).putObject("validation").putArray("allowedSchemes").add("javascript");}),
            bad("select missing options",t->{item(t).put("type","SINGLE_SELECT");item(t).putObject("validation");}),
            bad("select empty options",t->{item(t).put("type","SINGLE_SELECT");item(t).putObject("validation").putArray("options");}),
            bad("select duplicate options",t->{select(item(t));var a=(ArrayNode)validation(t).get("options");a.add(a.get(0).deepCopy());}),
            bad("select option missing label",t->{select(item(t));((ObjectNode)validation(t).at("/options/0")).remove("label");}),
            bad("multi bounds",t->{select(item(t));item(t).put("type","MULTI_SELECT");validation(t).put("minOptions",2).put("maxOptions",1);}),
            bad("file count",t->((ObjectNode)t.at("/sections/0/items/2/validation")).put("maxFiles",51)),
            bad("unsafe extension",t->{item(t).put("type","FILE");item(t).putObject("validation").put("maxFiles",1).putArray("allowedExtensions").add("../exe");}),
            bad("repeater rows",t->((ObjectNode)t.at("/sections/2/items/1/validation")).put("maxRows",21)),
            bad("repeater empty columns",t->((ObjectNode)t.at("/sections/2/items/1/validation")).putArray("columns")),
            bad("repeater nine columns",t->{var a=(ArrayNode)t.at("/sections/2/items/1/validation/columns");while(a.size()<9)a.add(a.get(0).deepCopy());}),
            bad("repeater duplicate column",t->((ObjectNode)t.at("/sections/2/items/1/validation/columns/1")).put("key","name")),
            bad("nested repeater",t->((ObjectNode)t.at("/sections/2/items/1/validation/columns/0")).put("type","REPEATER")),
            bad("column missing required",t->((ObjectNode)t.at("/sections/2/items/1/validation/columns/0")).remove("required")),
            bad("column select without options",t->((ObjectNode)t.at("/sections/2/items/1/validation/columns/0")).put("type","SINGLE_SELECT")),
            bad("AI short text",t->item(t).putObject("ai").put("enabled",true).put("targetWords",150)),
            bad("AI missing target",t->((ObjectNode)t.at("/sections/0/items/1/ai")).remove("targetWords")),
            bad("unknown condition",t->condition(item(t),"missing","yes")),bad("self condition",t->{select(item(t));condition(item(t),"home.headline","yes");}),
            bad("forward condition",t->{select((ObjectNode)t.at("/sections/0/items/1"));condition(item(t),"home.intro","yes");}),
            bad("cross section condition",t->{select(item(t));condition((ObjectNode)t.at("/sections/1/items/0"),"home.headline","yes");}),
            bad("nonselect dependency",t->condition((ObjectNode)t.at("/sections/0/items/1"),"home.headline","yes")),
            bad("missing option reference",t->{select(item(t));condition((ObjectNode)t.at("/sections/0/items/1"),"home.headline","no");}),
            bad("unsupported operator",t->{select(item(t));condition((ObjectNode)t.at("/sections/0/items/1"),"home.headline","yes").put("operator","NOT_EQUALS");}),
            bad("circular dependency",t->{var a=item(t);var b=(ObjectNode)t.at("/sections/0/items/1");select(a);select(b);condition(a,"home.intro","yes");condition(b,"home.headline","yes");}),
            bad("explicit sortOrder unsupported",t->item(t).put("sortOrder",-1))
        );
    }
    static void select(ObjectNode item) {
        item.put("type","SINGLE_SELECT");item.remove("ai");item.putObject("validation").putArray("options").addObject().put("key","yes").put("label","Yes");
    }
    static ObjectNode condition(ObjectNode item,String dependency,String option) {
        return item.putObject("visibleWhen").put("dependsOnItemKey",dependency).put("operator","EQUALS").put("optionKey",option);
    }
    @ParameterizedTest @MethodSource("invalid") void invalidStructuresRejectedWithSafeDiagnostics(Mutation mutation) throws Exception {
        var t=sample();mutation.change().accept(t);
        assertThatThrownBy(()->validator.validate(t)).isInstanceOfSatisfying(InvalidTemplate.class,e->{
            assertThat(e.diagnostic().fieldPath()).startsWith("$");assertThat(e.diagnostic().code()).isNotBlank();
            assertThat(e.getMessage()).doesNotContain("discarding me", "Synthetic", "regex");
        });
    }
    @ParameterizedTest @ValueSource(strings={"", "null", "[]", "{", "{\"schemaVersion\":1,\"schemaVersion\":2}", "{} {}", "{\"title\":NaN}"})
    void malformedAndUnsupportedDocumentsFailSafely(String source) {
        assertThatThrownBy(()->validator.validate(source)).isInstanceOf(InvalidTemplate.class).hasMessageNotContaining(source.length()>2?source:"secret");
    }
    @Test void requestByteLimitAppliedBeforeParsing() {assertThatThrownBy(()->validator.parse("x".repeat(1_048_577))).isInstanceOf(InvalidTemplate.class);}
    @Test void optionalDefinitionVersionAndValidEarlierConditionPreserveOrder() throws Exception {
        var t=sample();t.remove("version");select(item(t));condition((ObjectNode)t.at("/sections/0/items/1"),"home.headline","yes");
        assertThat(validator.validate(t)).isEqualTo(t);
        var a=(ArrayNode)t.at("/sections/0/items");var first=a.remove(0);a.add(first);
        assertThatThrownBy(()->validator.validate(t)).isInstanceOf(InvalidTemplate.class);
    }
    @Test void supportedRepeaterColumnSelectAndEmailFormatValidate() throws Exception {
        var t=sample();validation(t).put("format","email");item(t).put("enabled",false);
        var c=(ObjectNode)t.at("/sections/2/items/1/validation/columns/0");c.put("type","SINGLE_SELECT");c.putArray("options").addObject().put("key","yes").put("label","Yes");
        assertThat(validator.validate(t)).isEqualTo(t);
    }
    @Test void totalItemLimitAcrossIndividuallyValidSectionsEnforced() throws Exception {
        var t=sample();var sections=t.putArray("sections");
        for(int s=0;s<7;s++){
            var section=sections.addObject().put("key","s"+s).put("title","Section");var items=section.putArray("items");
            for(int i=0;i<50;i++)items.add(item(sample()).deepCopy().put("key","s"+s+".i"+i));
        }
        assertThatThrownBy(()->validator.validate(t)).isInstanceOf(InvalidTemplate.class).hasMessageContaining("ITEM_LIMIT");
    }
}
