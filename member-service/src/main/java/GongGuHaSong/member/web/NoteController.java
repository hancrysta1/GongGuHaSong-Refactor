package GongGuHaSong.member.web;

import GongGuHaSong.member.domain.Note;
import GongGuHaSong.member.repository.NoteRepository;
import GongGuHaSong.member.web.dto.NoteSaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
public class NoteController {

    private final NoteRepository noteRepository;

    @GetMapping("/note/send/{sender}")
    public List<Note> findBySender(@PathVariable String sender) {
        return noteRepository.findBySender(sender);
    }

    @GetMapping("/note/receive/{receiver}")
    public List<Note> findByReceiver(@PathVariable String receiver) {
        return noteRepository.findByReceiver(receiver);
    }

    @PostMapping("/note")
    public Note save(@RequestBody NoteSaveDto dto) {
        return noteRepository.save(dto.toEntity());
    }
}
