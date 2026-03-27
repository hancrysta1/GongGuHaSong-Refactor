package GongGuHaSong.member.web.dto;

import GongGuHaSong.member.domain.Note;
import lombok.Data;

@Data
public class NoteSaveDto {
    private String sender;
    private String receiver;
    private String comment;
    private String time;
    private String title;

    public Note toEntity() {
        Note note = new Note();
        note.setSender(sender);
        note.setReceiver(receiver);
        note.setComment(comment);
        note.setTime(time);
        note.setTitle(title);
        return note;
    }
}
