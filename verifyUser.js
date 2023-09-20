const verifyUser = (req, res, next) => {
  //狀況一: 前台頁面(無Session 只有GET => 不做任何動作)
  //後台必須登入才能使用
  //狀況二: 後台頁面(有Session 只有GET => 延長使用時間)
  //狀況三: 前台頁面(有Session 更改資料 =>延長使用時間)
  if (req.session.isVerified === undefined && req.method === "GET") {
    next();
  } else if (req.session.isVerified) {
    req.session.touch();
    next();
  } else {
    return res.status(440).json({ message: "Please login first" });
  }
};

module.exports = verifyUser;
