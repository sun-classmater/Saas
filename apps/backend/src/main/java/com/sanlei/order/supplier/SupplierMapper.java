package com.sanlei.order.supplier;

import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface SupplierMapper {

    @Select("SELECT id, name, type, contact, phone, active FROM suppliers ORDER BY active DESC, name")
    List<SupplierRow> listAll();

    @Select("SELECT id, name, type, contact, phone, active FROM suppliers WHERE id = #{id} LIMIT 1")
    SupplierRow findById(@Param("id") String id);

    @Insert("INSERT INTO suppliers (id, name, type, contact, phone, active) "
            + "VALUES (#{id}, #{name}, #{type}, #{contact}, #{phone}, #{active})")
    int insert(SupplierRow row);

    @Update("UPDATE suppliers SET name = #{name}, type = #{type}, contact = #{contact}, phone = #{phone}, "
            + "active = #{active} WHERE id = #{id}")
    int update(SupplierRow row);
}
