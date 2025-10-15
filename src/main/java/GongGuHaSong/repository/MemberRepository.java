package GongGuHaSong.repository;

import GongGuHaSong.domain.Member;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface MemberRepository extends MongoRepository<Member,String> {
    Member save(Member member);//저장소에 멤버저장
    Optional<Member> findByPid(String pid);
    Optional<Member> findByName(String name);
    Optional<Member> findByPwd(String pwd);
    Optional<Member> findByPhone(String phone);
    Optional<Member> findByEmail(String email);
    Optional<Member> findByAddress(String address);
    List<Member> findAll();
}

