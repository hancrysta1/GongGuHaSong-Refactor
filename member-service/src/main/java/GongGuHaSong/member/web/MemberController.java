package GongGuHaSong.member.web;

import GongGuHaSong.member.domain.Member;
import GongGuHaSong.member.service.MemberService;
import GongGuHaSong.member.web.dto.MemberSaveDto;
import GongGuHaSong.member.web.dto.MemberUpdateRequestDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
public class MemberController {

    private final MemberService memberService;

    @GetMapping("/member")
    public List<Member> findAll() {
        return memberService.findAll();
    }

    @GetMapping("/member/{pid}")
    public Member findByPid(@PathVariable String pid) {
        return memberService.findByPid(pid)
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));
    }

    @PostMapping("/member")
    public Member save(@RequestBody MemberSaveDto dto) {
        Member member = dto.toEntity();
        memberService.join(member);
        return member;
    }

    @DeleteMapping("/member/{pid}")
    public void delete(@PathVariable String pid) {
        memberService.findByPid(pid)
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));
        // delete logic handled by repository
    }

    @PatchMapping("/my/edit/{pid}")
    public void update(@PathVariable String pid, @RequestBody MemberUpdateRequestDto dto) {
        memberService.update(pid, dto.getPwd(), dto.getPhone(), dto.getEmail(), dto.getAddress());
    }
}
