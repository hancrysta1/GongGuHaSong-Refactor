package GongGuHaSong.service;

import GongGuHaSong.domain.Member;
import GongGuHaSong.repository.MemberRepository;
import GongGuHaSong.web.dto.MemberUpdateRequestDto;

import java.util.List;

//@Service //스프링 컨테이너에 멤버 서비스로 등록시켜준다.
//@Transactional //데이터 저장,변경 시 꼭 필요
public class MemberService {
    //저장소 객체 생성
    private final MemberRepository memberRepository;

    //여기서 인스턴스 생성하지 않고
    //아래와 같이 메소드를 만들어보자.
    //@Autowired
    public MemberService(MemberRepository memberRepository) {
        this.memberRepository = memberRepository;
    }//constructor : 외부에서 레파지토리를 넣어주도록 만들기! 여기서는 직접 new 선언 X
    //Dependent Injection : 외부에서 넣어주는 것!

    /**
     * 회원 가입
     */
    public String join(Member member) {
        //같은 이름이 있는 중복 회원X
        validateDuplicateMember(member); //중복 회원 검증
        memberRepository.save(member);
        return member.getPid();
    }

    private void validateDuplicateMember(Member member) {
        memberRepository.findByPid(member.getPid())
                .ifPresent(m -> {
                    throw new IllegalStateException("이미 존재하는 회원입니다."); //검증 필요 - 테스트케이스
                });
    }

    public String update(String pid, MemberUpdateRequestDto dto) {
        Member entity = memberRepository.findByPid(pid)
                .orElseThrow(() -> new IllegalArgumentException("해당 id가 없습니다."));

        entity.update(dto.getPwd(), dto.getPhone(), dto.getEmail(), dto.getAddress());

        return memberRepository.save(entity).getPid();
    }


    /**
     * 전체 회원 조회
     */
    public List<Member> findMembers() {
        return memberRepository.findAll();
    }

}