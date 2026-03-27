package GongGuHaSong.payment.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

@Slf4j
@Service
public class HmacService {

    private final String secretKey;

    public HmacService(@Value("${payment.secret-key}") String secretKey) {
        this.secretKey = secretKey;
    }

    /**
     * HMAC-SHA256 서명 생성.
     * 결제 요청 데이터(orderId + amount)를 Secret Key로 서명하여
     * 위변조 여부를 검증할 수 있는 해시값을 반환한다.
     */
    public String sign(String orderId, int amount) {
        String data = orderId + ":" + amount;
        return hmacSha256(data);
    }

    /**
     * HMAC-SHA256 서명 검증.
     * 수신된 데이터로 서명을 재생성하고, 전달받은 서명과 일치하는지 확인한다.
     * 일치하면 위변조 없음, 불일치하면 위변조 감지.
     */
    public boolean verify(String orderId, int amount, String signature) {
        String expected = sign(orderId, amount);
        boolean valid = expected.equals(signature);
        if (!valid) {
            log.warn("[HMAC] 서명 불일치 — 위변조 감지. orderId={}, amount={}", orderId, amount);
        }
        return valid;
    }

    private String hmacSha256(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(
                    secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("HMAC 서명 생성 실패", e);
        }
    }
}
