package GongGuHaSong.web.dto;

import GongGuHaSong.domain.Note;
import lombok.Data;

import java.util.Date;

@Data
public class NoteSaveDto {

    private String sender;
    private String receiver;
    private Date time = new Date();
    private String title;
    private String comment;

    public Note toEntity(){

        Note note = new Note();
        note.setSender(sender);
        note.setReceiver(receiver);
        note.setComment(comment);
        note.setTitle(title);
        note.setTime(time);

        return note;
    }
}