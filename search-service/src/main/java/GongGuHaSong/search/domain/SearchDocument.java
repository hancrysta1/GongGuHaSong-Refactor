package GongGuHaSong.search.domain;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import java.util.Date;

@Data
@Document(indexName = "products")
public class SearchDocument {
    @Id
    private String id;

    @Field(type = FieldType.Text, analyzer = "nori")
    private String title;

    @Field(type = FieldType.Text, analyzer = "nori")
    private String info;

    @Field(type = FieldType.Keyword)
    private String category;

    @Field(type = FieldType.Keyword)
    private String managerId;

    @Field(type = FieldType.Integer)
    private int price;

    @Field(type = FieldType.Integer)
    private int stock;

    @Field(type = FieldType.Date)
    private Date startDate;

    @Field(type = FieldType.Date)
    private Date finishDate;

    @Field(type = FieldType.Text)
    private String mainPhoto;
}
