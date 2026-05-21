package com.kyra.security.tracing;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;

import java.util.Map;
import java.util.function.Supplier;

/** Creates named spans around compliance operations so traces from the OTel java-agent include business context. */
public final class TraceHelper {

    private static final Tracer TRACER = GlobalOpenTelemetry.getTracer("kyra.security", "1.0.0");

    private TraceHelper() {}

    public static <T> T span(String name, Map<String, Object> attrs, Supplier<T> fn) {
        Span span = TRACER.spanBuilder(name).startSpan();
        if (attrs != null) {
            for (var e : attrs.entrySet()) {
                Object v = e.getValue();
                if (v == null) continue;
                if (v instanceof Number n) span.setAttribute(AttributeKey.longKey(e.getKey()), n.longValue());
                else if (v instanceof Boolean b) span.setAttribute(AttributeKey.booleanKey(e.getKey()), b);
                else span.setAttribute(AttributeKey.stringKey(e.getKey()), v.toString());
            }
        }
        try (Scope ignored = span.makeCurrent()) {
            T out = fn.get();
            span.setStatus(StatusCode.OK);
            return out;
        } catch (RuntimeException ex) {
            span.recordException(ex);
            span.setStatus(StatusCode.ERROR, ex.getMessage());
            throw ex;
        } finally {
            span.end();
        }
    }

    public static void runSpan(String name, Map<String, Object> attrs, Runnable r) {
        span(name, attrs, () -> { r.run(); return null; });
    }
}
