"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, MessageSquare, Calendar, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Conversation } from "@/types";
import { formatDistanceToNow } from "date-fns";

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filtered, setFiltered] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [personaFilter, setPersonaFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<Conversation[]>("/conversations");
        setConversations(data);
        setFiltered(data);
      } catch {}
      setIsLoading(false);
    };
    fetchConversations();
  }, []);

  const applyFilters = useCallback(() => {
    let results = [...conversations];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter((c) => c.title.toLowerCase().includes(q));
    }

    // Persona filter
    if (personaFilter !== "all") {
      results = results.filter((c) => c.personaId === personaFilter);
    }

    // Date range filter
    if (dateRange !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (dateRange === "today") cutoff.setDate(now.getDate() - 1);
      else if (dateRange === "week") cutoff.setDate(now.getDate() - 7);
      else if (dateRange === "month") cutoff.setMonth(now.getMonth() - 1);

      results = results.filter((c) => new Date(c.updatedAt) >= cutoff);
    }

    setFiltered(results);
  }, [conversations, searchQuery, personaFilter, dateRange]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const uniquePersonas = Array.from(
    new Set(conversations.map((c) => c.personaId))
  );

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Conversation History</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Search and browse your past conversations
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="pl-9"
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex gap-4 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Persona
              </label>
              <select
                value={personaFilter}
                onChange={(e) => setPersonaFilter(e.target.value)}
                className="flex h-9 rounded-sm border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All Personas</option>
                {uniquePersonas.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="flex h-9 rounded-sm border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Past Week</option>
                <option value="month">Past Month</option>
              </select>
            </div>
          </div>
        )}

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No conversations found</p>
            {searchQuery && (
              <p className="text-sm text-muted-foreground mt-1">
                Try a different search term
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {filtered.length} conversation{filtered.length !== 1 ? "s" : ""}{" "}
              found
            </p>
            {filtered.map((conv) => (
              <Link key={conv.id} href={`/chat/${conv.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {highlightMatch(conv.title, searchQuery)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {conv.personaId}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {conv.messageCount} messages
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(conv.updatedAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
