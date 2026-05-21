package com.kyra.chat.controller;

import com.kyra.chat.model.Persona;
import com.kyra.chat.repository.PersonaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.List;

@RestController
@RequestMapping("/v1/personas")
@RequiredArgsConstructor
public class PersonaController {

    private final PersonaRepository personaRepository;

    @GetMapping
    public Mono<List<Persona>> listPersonas() {
        return Mono.fromCallable(personaRepository::findByIsActiveTrueOrderByDisplayOrderAsc)
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}")
    public Mono<Persona> getPersona(@PathVariable String id) {
        return Mono.fromCallable(() -> personaRepository.findById(id)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Persona not found: " + id)))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
