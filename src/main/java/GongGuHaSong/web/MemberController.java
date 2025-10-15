package GongGuHaSong.web;


import GongGuHaSong.domain.Member;
import GongGuHaSong.repository.MemberRepository;
import GongGuHaSong.service.MemberService;
import GongGuHaSong.web.dto.MemberSaveDto;
import GongGuHaSong.web.dto.MemberUpdateRequestDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor //DI
@RestController
//@RestController //데이터 리턴 서버 -> @ResponseBody 를 전체적으로 덧입힌 효과. (return 문자열 그대로 출력)
public class MemberController {
    //DI
    private final MemberRepository memberRepository;
    private final MemberService memberService;//단순한 기능.하나만 선언해도 되는 거기 때문에

    @ResponseBody
    @GetMapping("/member/{pid}")
    public Member findById(@PathVariable String pid) {
        return memberRepository.findById(pid).get();
    }

    @ResponseBody
    @DeleteMapping("member/{pid}")
    public int deleteById(@PathVariable String pid) {
        memberRepository.deleteById(pid);
        return 1; //1:성공, -1:실패
    }

    @ResponseBody
    @GetMapping("/member")//회원 전체보기
    public List<Member> findAll() {
        return memberRepository.findAll();
    }

    @ResponseBody
    @PostMapping("/member")
    public Member save(@RequestBody MemberSaveDto dto) {
        //{"title":"제목","content":"내용"}
        //@RequsetBody 어노테이션을 붙인 이유는 json 타입으로 데이터를 받기 위함.
        Member memberEntity = memberRepository.save(dto.toEntity());
        return memberEntity;
    }

    @RequestMapping(value = "/member/new", method = RequestMethod.GET)
    public String createForm() {
        return "member/createMemberForm";//왜 안먹는거야?
    }

    @ResponseBody
    @RequestMapping(value = "/member/new", method = RequestMethod.POST)
    //@PostMapping("/member/new") //데이터등록
    public Member save2(MemberSaveDto dto) {
        Member memberEntity = memberRepository.save(dto.toEntity());
        return memberEntity;
    }


    @PatchMapping("/my/edit/{pid}")
    public String update(@PathVariable String pid, @RequestBody MemberUpdateRequestDto dto) {
        return memberService.update(pid, dto);
    }
}

