package com.kyra.workflow.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class OutputFormatter {

    private final ObjectMapper objectMapper;

    /**
     * Format workflow output in the requested format.
     */
    public String format(Map<String, Object> output, String outputFormat) {
        return switch (outputFormat.toLowerCase()) {
            case "json" -> formatJson(output);
            case "html" -> formatHtml(output);
            case "table" -> formatTable(output);
            default -> formatMarkdown(output);
        };
    }

    private String formatMarkdown(Map<String, Object> output) {
        StringBuilder sb = new StringBuilder();

        if (output.containsKey("title")) {
            sb.append("# ").append(output.get("title")).append("\n\n");
        }

        if (output.containsKey("content")) {
            sb.append(output.get("content")).append("\n\n");
        }

        if (output.containsKey("sections")) {
            Object sections = output.get("sections");
            if (sections instanceof List<?> sectionList) {
                for (Object section : sectionList) {
                    if (section instanceof Map<?, ?> sectionMap) {
                        if (sectionMap.containsKey("heading")) {
                            sb.append("## ").append(sectionMap.get("heading")).append("\n\n");
                        }
                        if (sectionMap.containsKey("body")) {
                            sb.append(sectionMap.get("body")).append("\n\n");
                        }
                    }
                }
            }
        }

        if (output.containsKey("summary")) {
            sb.append("---\n\n**Summary:** ").append(output.get("summary")).append("\n");
        }

        return sb.toString().trim();
    }

    private String formatJson(Map<String, Object> output) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(output);
        } catch (JsonProcessingException e) {
            log.error("Failed to format output as JSON", e);
            return output.toString();
        }
    }

    private String formatHtml(Map<String, Object> output) {
        StringBuilder sb = new StringBuilder();
        sb.append("<div class=\"workflow-output\">\n");

        if (output.containsKey("title")) {
            sb.append("  <h1>").append(escapeHtml(output.get("title").toString())).append("</h1>\n");
        }

        if (output.containsKey("content")) {
            sb.append("  <div class=\"content\"><p>").append(escapeHtml(output.get("content").toString())).append("</p></div>\n");
        }

        if (output.containsKey("sections")) {
            Object sections = output.get("sections");
            if (sections instanceof List<?> sectionList) {
                for (Object section : sectionList) {
                    if (section instanceof Map<?, ?> sectionMap) {
                        sb.append("  <section>\n");
                        if (sectionMap.containsKey("heading")) {
                            sb.append("    <h2>").append(escapeHtml(sectionMap.get("heading").toString())).append("</h2>\n");
                        }
                        if (sectionMap.containsKey("body")) {
                            sb.append("    <p>").append(escapeHtml(sectionMap.get("body").toString())).append("</p>\n");
                        }
                        sb.append("  </section>\n");
                    }
                }
            }
        }

        if (output.containsKey("summary")) {
            sb.append("  <div class=\"summary\"><strong>Summary:</strong> ").append(escapeHtml(output.get("summary").toString())).append("</div>\n");
        }

        sb.append("</div>");
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private String formatTable(Map<String, Object> output) {
        StringBuilder sb = new StringBuilder();

        if (output.containsKey("title")) {
            sb.append("# ").append(output.get("title")).append("\n\n");
        }

        if (output.containsKey("rows") && output.containsKey("columns")) {
            List<String> columns = (List<String>) output.get("columns");
            List<Map<String, Object>> rows = (List<Map<String, Object>>) output.get("rows");

            // Header
            sb.append("| ").append(String.join(" | ", columns)).append(" |\n");
            sb.append("| ").append(columns.stream().map(c -> "---").reduce((a, b) -> a + " | " + b).orElse("")).append(" |\n");

            // Rows
            for (Map<String, Object> row : rows) {
                sb.append("| ");
                for (int i = 0; i < columns.size(); i++) {
                    if (i > 0) sb.append(" | ");
                    Object val = row.get(columns.get(i));
                    sb.append(val != null ? val.toString() : "");
                }
                sb.append(" |\n");
            }
        } else if (output.containsKey("content")) {
            sb.append(output.get("content"));
        }

        return sb.toString().trim();
    }

    private String escapeHtml(String text) {
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;");
    }
}
