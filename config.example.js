/**
 * File cấu hình tra cứu SP2.
 * Copy file này thành config.js rồi điền URL và Authorization của bạn.
 * Khi token/authorization thay đổi, chỉ cần sửa config.js.
 */

export default {
  /** URL trang tra cứu Splitter theo port OLT */
  baseUrl: 'https://onebss.vnpt.vn/#/ecms/tracuu-splitter-theo-port-olt',

  /**
   * Authorization gửi kèm mọi request (thường là Bearer token).
   * Ví dụ: 'Bearer eyJhbGciOiJIUzI1NiIs...'
   * Khi token hết hạn hoặc đổi, chỉ cần cập nhật giá trị này.
   */
  authorization: '',
}
