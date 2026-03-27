package GongGuHaSong.member.service;

import GongGuHaSong.member.domain.Member;
import GongGuHaSong.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class MemberService {

    private final MemberRepository memberRepository;
    private final RestTemplate restTemplate;

    public String join(Member member) {
        validateDuplicateMember(member);
        memberRepository.save(member);

        // 회원가입 축하 포인트 지급
        try {
            Map<String, Object> pointRequest = new HashMap<>();
            pointRequest.put("userId", member.getPid());
            pointRequest.put("amount", 10000);
            pointRequest.put("description", "회원가입 축하 포인트");
            restTemplate.postForObject(
                "http://point-service/point/earn",
                pointRequest,
                String.class
            );
            log.info("회원가입 축하 포인트 지급 완료: userId={}", member.getPid());
        } catch (Exception e) {
            log.warn("회원가입 축하 포인트 지급 실패 (point-service 연결 불가): {}", e.getMessage());
        }

        return member.getPid();
    }

    private void validateDuplicateMember(Member member) {
        memberRepository.findByPid(member.getPid())
            .ifPresent(m -> {
                throw new IllegalStateException("이미 존재하는 회원입니다.");
            });
    }

    public void update(String pid, String pwd, String phone, String email, String address) {
        Member member = memberRepository.findByPid(pid)
            .orElseThrow(() -> new IllegalStateException("회원을 찾을 수 없습니다."));
        member.update(pwd, phone, email, address);
        memberRepository.save(member);
    }

    public List<Member> findAll() {
        return memberRepository.findAll();
    }

    public Optional<Member> findByPid(String pid) {
        return memberRepository.findByPid(pid);
    }
}
