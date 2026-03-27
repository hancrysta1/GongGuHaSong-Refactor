package GongGuHaSong.member.repository;

import GongGuHaSong.member.domain.Note;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface NoteRepository extends MongoRepository<Note, String> {
    List<Note> findBySender(String sender);
    List<Note> findByReceiver(String receiver);
    List<Note> findByTitle(String title);
    List<Note> findAll();
}
