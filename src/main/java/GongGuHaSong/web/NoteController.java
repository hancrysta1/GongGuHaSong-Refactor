package GongGuHaSong.web;


import GongGuHaSong.domain.Note;
import GongGuHaSong.repository.NoteRepository;
import GongGuHaSong.web.dto.NoteSaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor //DI
@RestController //데이터 리턴 서버
public class NoteController {

    private final NoteRepository nr;

    @GetMapping("/note/send/{sender}")//쪽지 발신내역
    public List<Note> findBySender(@PathVariable String sender) {
        return nr.findBySender(sender);
    }

    @GetMapping("/note/receive/{receiver}")//쪽지 수신내역
    public List<Note> findByReceiver(@PathVariable String receiver) {
        return nr.findByReceiver(receiver);
    }

    @PostMapping("/note")
    public Note save(@RequestBody NoteSaveDto dto) {
        Note noteEntity = nr.save(dto.toEntity());
        return noteEntity;
    }

}