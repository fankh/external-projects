package com.kyra.agent.service;

import jakarta.annotation.PostConstruct;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class ToolRegistry {

    private final Map<String, ToolDefinition> tools = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        registerBuiltInTools();
        log.info("ToolRegistry initialized with {} tools", tools.size());
    }

    private void registerBuiltInTools() {
        register(ToolDefinition.builder()
                .name("document_search")
                .description("Search documents by keyword or semantic query")
                .inputSchema(Map.of(
                        "query", "string (required) - search query",
                        "max_results", "integer (optional, default 10) - max results to return",
                        "filters", "object (optional) - metadata filters"
                ))
                .requiresApproval(false)
                .build());

        register(ToolDefinition.builder()
                .name("document_summarize")
                .description("Generate a summary of one or more documents")
                .inputSchema(Map.of(
                        "document_ids", "array of string (required) - document IDs to summarize",
                        "max_length", "integer (optional, default 500) - max summary length in words"
                ))
                .requiresApproval(false)
                .build());

        register(ToolDefinition.builder()
                .name("web_search")
                .description("Search the web for information")
                .inputSchema(Map.of(
                        "query", "string (required) - search query",
                        "max_results", "integer (optional, default 5) - max results"
                ))
                .requiresApproval(false)
                .build());

        register(ToolDefinition.builder()
                .name("data_query")
                .description("Execute a structured data query against internal databases")
                .inputSchema(Map.of(
                        "query", "string (required) - natural language query",
                        "database", "string (optional) - target database name",
                        "limit", "integer (optional, default 100) - row limit"
                ))
                .requiresApproval(true)
                .build());

        register(ToolDefinition.builder()
                .name("send_notification")
                .description("Send a notification to a user or channel")
                .inputSchema(Map.of(
                        "recipient", "string (required) - user ID or channel name",
                        "message", "string (required) - notification message",
                        "type", "string (optional, default 'info') - info, warning, error"
                ))
                .requiresApproval(true)
                .build());

        register(ToolDefinition.builder()
                .name("generate_report")
                .description("Generate a formatted report from data")
                .inputSchema(Map.of(
                        "title", "string (required) - report title",
                        "data", "object (required) - data to include in the report",
                        "format", "string (optional, default 'pdf') - output format: pdf, html, csv"
                ))
                .requiresApproval(false)
                .build());

        register(ToolDefinition.builder()
                .name("create_bookmark")
                .description("Create a bookmark for a resource")
                .inputSchema(Map.of(
                        "url", "string (required) - resource URL",
                        "title", "string (required) - bookmark title",
                        "tags", "array of string (optional) - tags for categorization"
                ))
                .requiresApproval(false)
                .build());

        register(ToolDefinition.builder()
                .name("analyze_sentiment")
                .description("Analyze sentiment of text content")
                .inputSchema(Map.of(
                        "text", "string (required) - text to analyze",
                        "language", "string (optional, default 'en') - language code"
                ))
                .requiresApproval(false)
                .build());

        register(ToolDefinition.builder()
                .name("translate_text")
                .description("Translate text between languages")
                .inputSchema(Map.of(
                        "text", "string (required) - text to translate",
                        "source_language", "string (optional) - source language code (auto-detect if omitted)",
                        "target_language", "string (required) - target language code"
                ))
                .requiresApproval(false)
                .build());

        register(ToolDefinition.builder()
                .name("code_review")
                .description("Review code for quality, security, and best practices")
                .inputSchema(Map.of(
                        "code", "string (required) - code to review",
                        "language", "string (optional) - programming language",
                        "focus", "array of string (optional) - areas to focus on: security, performance, style"
                ))
                .requiresApproval(false)
                .build());
    }

    public void register(ToolDefinition tool) {
        tools.put(tool.getName(), tool);
        log.debug("Registered tool: {}", tool.getName());
    }

    public Optional<ToolDefinition> getTool(String name) {
        return Optional.ofNullable(tools.get(name));
    }

    public List<ToolDefinition> getAllTools() {
        return new ArrayList<>(tools.values());
    }

    public List<ToolDefinition> getToolsByNames(List<String> names) {
        return names.stream()
                .map(tools::get)
                .filter(Objects::nonNull)
                .toList();
    }

    public boolean toolRequiresApproval(String toolName) {
        ToolDefinition tool = tools.get(toolName);
        return tool != null && tool.isRequiresApproval();
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ToolDefinition {
        private String name;
        private String description;
        private Map<String, Object> inputSchema;
        private boolean requiresApproval;
    }
}
