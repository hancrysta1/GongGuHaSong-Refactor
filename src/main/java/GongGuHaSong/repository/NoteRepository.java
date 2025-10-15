package GongGuHaSong.repository;

import GongGuHaSong.domain.Note;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface NoteRepository extends MongoRepository<Note, String>
{
    Note save(Note note);
    List<Note> findBySender(String sender);
    List<Note> findByReceiver(String receiver);
    Optional<Note> findByTitle(String title);
    List<Note> findAll();

}