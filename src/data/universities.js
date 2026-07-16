export const countryOrder = [
  'Palestine',
  'Jordan',
  'Lebanon',
  'Syria',
  'Iraq',
  'Egypt',
  'Saudi Arabia',
  'UAE',
  'Kuwait',
  'Bahrain',
  'Qatar',
  'Oman',
  'Yemen',
  'Iran',
  'Turkey',
]

export const universities = [
  // ─── Palestine ───
  { id: 'anu', label: 'An-Najah National University', arabic: 'جامعة النجاح الوطنية', city: 'Nablus', country: 'Palestine', aliases: ['ANU', 'النجاح', 'Najah'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'qu', label: 'Al-Quds University', arabic: 'جامعة القدس', city: 'Abu Dis', country: 'Palestine', aliases: ['QU', 'القدس', 'Al Quds'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'bzu', label: 'Birzeit University', arabic: 'جامعة بيرزيت', city: 'Birzeit', country: 'Palestine', aliases: ['BZU', 'بيرزيت'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'isu', label: 'Islamic University of Gaza', arabic: 'الجامعة الإسلامية - غزة', city: 'Gaza', country: 'Palestine', aliases: ['IUG', 'الجامعة الاسلامية', 'Islamic University'], faculties: ['Medicine', 'Nursing'] },
  { id: 'ppu', label: 'Palestine Polytechnic University', arabic: 'جامعة بوليتكنك فلسطين', city: 'Hebron', country: 'Palestine', aliases: ['PPU', 'بوليتكنك', 'Pal Polytechnic'], faculties: ['Medicine', 'Dentistry', 'Pharmacy'] },
  { id: 'bu', label: 'Al-Azhar University - Gaza', arabic: 'جامعة الأزهر - غزة', city: 'Gaza', country: 'Palestine', aliases: ['الأزهر', 'Al Azhar Gaza'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'uop', label: 'University of Palestine', arabic: 'جامعة فلسطين', city: 'Gaza', country: 'Palestine', aliases: ['UP', 'فلسطين'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'qou', label: 'Al-Quds Open University', arabic: 'جامعة القدس المفتوحة', city: 'Ramallah', country: 'Palestine', aliases: ['QOU', 'القدس المفتوحة'], faculties: ['Pharmacy'] },
  { id: 'ptu', label: 'Palestine Technical University - Kadoorie', arabic: 'جامعة فلسطين التقنية - خضوري', city: 'Tulkarm', country: 'Palestine', aliases: ['PTU', 'Kadoorie', 'خضوري'], faculties: ['Pharmacy'] },
  { id: 'buhebron', label: 'Hebron University', arabic: 'جامعة الخليل', city: 'Hebron', country: 'Palestine', aliases: ['الخليل', 'Hebron Univ'], faculties: ['Pharmacy'] },

  // ─── Jordan ───
  { id: 'ju', label: 'University of Jordan', arabic: 'الجامعة الأردنية', city: 'Amman', country: 'Jordan', aliases: ['UJ', 'الاردنية', 'Jordan Univ'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'just', label: 'Jordan University of Science and Technology', arabic: 'جامعة العلوم والتكنولوجيا الأردنية', city: 'Irbid', country: 'Jordan', aliases: ['JUST', 'العلوم والتكنولوجيا', 'JUST Irbid'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'gem', label: 'German Jordanian University', arabic: 'الجامعة الألمانية الأردنية', city: 'Amman', country: 'Jordan', aliases: ['GJU', 'الألمانية'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'ju-st', label: 'Hashemite University', arabic: 'الجامعة الهاشمية', city: 'Zarqa', country: 'Jordan', aliases: ['HU', 'الهاشمية'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'mu', label: 'Mutah University', arabic: 'جامعة المتقى', city: 'Karak', country: 'Jordan', aliases: ['المتقى', 'Al Mutah'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'aau', label: 'Al-Ahliyya Amman University', arabic: 'جامعة الأهلية - عمان', city: 'Amman', country: 'Jordan', aliases: ['AAU', 'الأهلية'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'jfpu', label: 'Jerash Private University', arabic: 'جامعة جرش الخاصة', city: 'Jerash', country: 'Jordan', aliases: ['JPU', 'جرش'], faculties: ['Pharmacy'] },
  { id: 'zau', label: 'Zarqa University', arabic: 'جامعة الزرقاء', city: 'Zarqa', country: 'Jordan', aliases: ['الزرقاء'], faculties: ['Pharmacy'] },

  // ─── Lebanon ───
  { id: 'aub', label: 'American University of Beirut', arabic: 'الجامعة الأمريكية في بيروت', city: 'Beirut', country: 'Lebanon', aliases: ['AUB', 'الأمريكية', 'American Beirut'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'lau', label: 'Lebanese American University', arabic: 'الجامعة اللبنانية الأمريكية', city: 'Beirut', country: 'Lebanon', aliases: ['LAU', 'اللبنانية الأمريكية'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'uob', label: 'Université Saint-Joseph', arabic: 'الجامعة اللبنانية', city: 'Beirut', country: 'Lebanon', aliases: ['USJ', 'الجامعة اليسوعية', 'St Joseph'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'lu', label: 'Lebanese University', arabic: 'الجامعة اللبنانية', city: 'Beirut', country: 'Lebanon', aliases: ['LU', 'اللبنانية'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'aou-lb', label: 'Arab Open University - Lebanon', arabic: 'الجامعة العربية المفتوحة - لبنان', city: 'Beirut', country: 'Lebanon', aliases: ['AOU-LB'], faculties: ['Medicine'] },
  { id: 'balamand', label: 'University of Balamand', arabic: 'جامعة البلمند', city: 'Koura', country: 'Lebanon', aliases: ['UOB', 'البلمند'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'haigazian', label: 'Haigazian University', arabic: 'جامعة هاغوغيان', city: 'Beirut', country: 'Lebanon', aliases: ['HU-LB', 'هاغوغيان'], faculties: ['Pharmacy'] },

  // ─── Syria ───
  { id: 'damascus', label: 'University of Damascus', arabic: 'جامعة دمشق', city: 'Damascus', country: 'Syria', aliases: ['دمشق', 'Damascus Univ'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'aleppo', label: 'University of Aleppo', arabic: 'جامعة حلب', city: 'Aleppo', country: 'Syria', aliases: ['حلب', 'Aleppo Univ'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'tishreen', label: 'Tishreen University', arabic: 'جامعة تشرين', city: 'Latakia', country: 'Syria', aliases: ['تشرين'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'albaath', label: 'Al-Baath University', arabic: 'جامعة البعث', city: 'Homs', country: 'Syria', aliases: ['البعث'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'idlib', label: 'Idlib University', arabic: 'جامعة إدلب', city: 'Idlib', country: 'Syria', aliases: ['إدلب'], faculties: ['Medicine'] },
  { id: 'daraa', label: 'Daraa University', arabic: 'جامعة درعا', city: 'Daraa', country: 'Syria', aliases: ['درعا'], faculties: ['Medicine'] },
  { id: 'hama', label: 'Al-Watania University', arabic: 'جامعة الوطني', city: 'Hama', country: 'Syria', aliases: ['الوطني'], faculties: ['Pharmacy'] },

  // ─── Iraq ───
  { id: 'uobaghdad', label: 'University of Baghdad', arabic: 'جامعة بغداد', city: 'Baghdad', country: 'Iraq', aliases: ['Baghdad Univ', 'بغداد'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'basra', label: 'University of Basra', arabic: 'جامعة البصرة', city: 'Basra', country: 'Iraq', aliases: ['البصرة'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'mosul', label: 'University of Mosul', arabic: 'جامعة الموصل', city: 'Mosul', country: 'Iraq', aliases: ['الموصل'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'nahrain', label: 'Al-Nahrain University', arabic: 'جامعة النهرين', city: 'Baghdad', country: 'Iraq', aliases: ['النهرين', 'Nahrain'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'mustansiriyah', label: 'University of Mustansiriyah', arabic: 'جامعة المستنصرية', city: 'Baghdad', country: 'Iraq', aliases: ['المستنصرية', 'Mustansiriya'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'kufa', label: 'University of Kufa', arabic: 'جامعة الكوفة', city: 'Kufa', country: 'Iraq', aliases: ['الكوفة'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'diyala', label: 'University of Diyala', arabic: 'جامعة ديالى', city: 'Baqubah', country: 'Iraq', aliases: ['ديالى'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'sulaimani', label: 'University of Sulaimani', arabic: 'جامعة السليمانية', city: 'Sulaimaniyah', country: 'Iraq', aliases: ['Sulaimani', 'السليمانية'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'erbil', label: 'Hawler Medical University', arabic: 'جامعة هولير الطبية', city: 'Erbil', country: 'Iraq', aliases: ['HMU', 'هولير', 'Erbil Medical'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'kurdistan', label: 'University of Kurdistan - Hewler', arabic: 'جامعة كردستان - هولير', city: 'Erbil', country: 'Iraq', aliases: ['UKH', 'كردستان'], faculties: ['Medicine'] },
  { id: 'babil', label: 'University of Babylon', arabic: 'جامعة بابل', city: 'Hilla', country: 'Iraq', aliases: ['بابل'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'najaf', label: 'University of Kufa - Najaf', arabic: 'جامعة الكوفة - النجف', city: 'Najaf', country: 'Iraq', aliases: ['النجف'], faculties: ['Medicine'] },

  // ─── Egypt ───
  { id: 'cu', label: 'Cairo University', arabic: 'جامعة القاهرة', city: 'Cairo', country: 'Egypt', aliases: ['القاهرة', 'Cairo Univ'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'au', label: 'Ain Shams University', arabic: 'جامعة عين شمس', city: 'Cairo', country: 'Egypt', aliases: ['عين شمس', 'Ain Shams'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'mu-eg', label: 'Al-Azhar University', arabic: 'جامعة الأزهر', city: 'Cairo', country: 'Egypt', aliases: ['الأزهر', 'Al Azhar Cairo'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'alex', label: 'Alexandria University', arabic: 'جامعة الإسكندرية', city: 'Alexandria', country: 'Egypt', aliases: ['الإسكندرية', 'Alex Univ'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'msa', label: 'Misr International University', arabic: 'جامعة مصر الدولية', city: 'Cairo', country: 'Egypt', aliases: ['MIU', 'مصر الدولية'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'guc', label: 'German University in Cairo', arabic: 'الجامعة الألمانية بالقاهرة', city: 'Cairo', country: 'Egypt', aliases: ['GUC', 'الألمانية بالقاهرة'], faculties: ['Pharmacy'] },
  { id: 'helia', label: 'Heliopolis University', arabic: 'جامعة هليوبوليس', city: 'Cairo', country: 'Egypt', aliases: ['هليوبوليس'], faculties: ['Pharmacy'] },
  { id: 'nile', label: 'Nile University', arabic: 'جامعة النيل', city: 'Cairo', country: 'Egypt', aliases: ['النيل'], faculties: ['Pharmacy'] },
  { id: 'buc', label: 'British University in Egypt', arabic: 'الجامعة البريطانية في مصر', city: 'Cairo', country: 'Egypt', aliases: ['BUE', 'British Egypt'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'mans', label: 'Mansoura University', arabic: 'جامعة المنصورة', city: 'Mansoura', country: 'Egypt', aliases: ['المنصورة'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'tanta', label: 'Tanta University', arabic: 'جامعة طنطا', city: 'Tanta', country: 'Egypt', aliases: ['طنطا'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'assiut', label: 'Assiut University', arabic: 'جامعة أسيوط', city: 'Assiut', country: 'Egypt', aliases: ['أسيوط'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'suez', label: 'Suez Canal University', arabic: 'جامعة قناة السويس', city: 'Ismailia', country: 'Egypt', aliases: ['قناة السويس'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'zag', label: 'Zagazig University', arabic: 'جامعة الزقازيق', city: 'Zagazig', country: 'Egypt', aliases: ['الزقازيق'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'benha', label: 'Benha University', arabic: 'جامعة بنها', city: 'Benha', country: 'Egypt', aliases: ['بنها'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'sohag', label: 'Sohag University', arabic: 'جامعة سوهاج', city: 'Sohag', country: 'Egypt', aliases: ['سوهاج'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'kafr-elsh', label: 'Kafr El Sheikh University', arabic: 'جامعة كفر الشيخ', city: 'Kafr El Sheikh', country: 'Egypt', aliases: ['كفر الشيخ'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'damanhur', label: 'Damanhour University', arabic: 'جامعة دمنهور', city: 'Damanhour', country: 'Egypt', aliases: ['دمنهور'], faculties: ['Medicine'] },
  { id: 'port-said', label: 'Port Said University', arabic: 'جامعة بورسعيد', city: 'Port Said', country: 'Egypt', aliases: ['بورسعيد'], faculties: ['Medicine', 'Pharmacy'] },

  // ─── Saudi Arabia ───
  { id: 'ksu', label: 'King Saud University', arabic: 'جامعة الملك سعود', city: 'Riyadh', country: 'Saudi Arabia', aliases: ['KSU', 'الملك سعود'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'ksau-hs', label: 'King Saud bin Abdulaziz University for Health Sciences', arabic: 'جامعة الملك سعود بن عبدالعزيز للعلوم الصحية', city: 'Riyadh', country: 'Saudi Arabia', aliases: ['KSAU-HS', 'العلوم الصحية'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'kau', label: 'King Abdulaziz University', arabic: 'جامعة الملك عبدالعزيز', city: 'Jeddah', country: 'Saudi Arabia', aliases: ['KAU', 'الملك عبدالعزيز'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'kfupm', label: 'King Fahd University of Petroleum and Minerals', arabic: 'جامعة الملك فهد للبترول والمعادن', city: 'Dhahran', country: 'Saudi Arabia', aliases: ['KFUPM', 'البترول والمعادن'], faculties: ['Medicine'] },
  { id: 'kfmc', label: 'King Faisal Specialist Hospital and Research Centre', arabic: 'مستشفى الملك فيصل التخصصي', city: 'Riyadh', country: 'Saudi Arabia', aliases: ['KFSH&RC', 'King Faisal'], faculties: ['Medicine'] },
  { id: 'imu', label: 'Imam Mohammad Ibn Saud Islamic University', arabic: 'جامعة الإمام محمد بن سعود الإسلامية', city: 'Riyadh', country: 'Saudi Arabia', aliases: ['IMSU', 'الامام'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'taibau', label: 'Taibah University', arabic: 'جامعة طيبة', city: 'Medina', country: 'Saudi Arabia', aliases: ['طيبة'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'uqu', label: 'Umm Al-Qura University', arabic: 'جامعة أم القرى', city: 'Mecca', country: 'Saudi Arabia', aliases: ['UQU', 'ام القرى'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'jazan', label: 'Jazan University', arabic: 'جامعة جازان', city: 'Jazan', country: 'Saudi Arabia', aliases: ['جازان'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'hail', label: "University of Ha'il", arabic: 'جامعة حائل', city: "Ha'il", country: 'Saudi Arabia', aliases: ['حائل'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'tabuk', label: 'University of Tabuk', arabic: 'جامعة تبوك', city: 'Tabuk', country: 'Saudi Arabia', aliases: ['تبوك'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'qassim', label: 'Qassim University', arabic: 'جامعة القصيم', city: 'Buraidah', country: 'Saudi Arabia', aliases: ['القصيم'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'jouf', label: 'Al-Jouf University', arabic: 'جامعة الجوف', city: 'Sakakah', country: 'Saudi Arabia', aliases: ['الجوف'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'najran', label: 'Najran University', arabic: 'جامعة نجران', city: 'Najran', country: 'Saudi Arabia', aliases: ['نجران'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'shaqra', label: 'Shaqra University', arabic: 'جامعة شقراء', city: 'Shaqra', country: 'Saudi Arabia', aliases: ['شقراء'], faculties: ['Medicine'] },
  { id: 'tamimah', label: 'University of Hafr Al-Batin', arabic: 'جامعة حفر الباطن', city: 'Hafr Al-Batin', country: 'Saudi Arabia', aliases: ['حفر الباطن'], faculties: ['Medicine'] },

  // ─── UAE ───
  { id: 'uoa', label: 'United Arab Emirates University', arabic: 'جامعة الإمارات العربية المتحدة', city: 'Al Ain', country: 'UAE', aliases: ['UAEU', 'الإمارات'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'ku', label: 'Khalifa University', arabic: 'جامعة خليفة', city: 'Abu Dhabi', country: 'UAE', aliases: ['KU', 'خليفة'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'mua', label: 'Medical University of Sharjah', arabic: 'الجامعة الطبية بالشارقة', city: 'Sharjah', country: 'UAE', aliases: ['MUS', 'الشارقة الطبية'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'gmu', label: 'Gulf Medical University', arabic: 'جامعة الخليج الطبية', city: 'Ajman', country: 'UAE', aliases: ['GMU', 'الخليج الطبية'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'aud', label: 'American University in Dubai', arabic: 'الجامعة الأمريكية في دبي', city: 'Dubai', country: 'UAE', aliases: ['AUD', 'الأمريكية في دبي'], faculties: ['Pharmacy'] },
  { id: 'zu', label: 'Zayed University', arabic: 'جامعة زايد', city: 'Abu Dhabi', country: 'UAE', aliases: ['ZU', 'زايد'], faculties: ['Pharmacy'] },
  { id: 'hct', label: 'Higher Colleges of Technology', arabic: 'الكليات التقنية العليا', city: 'Abu Dhabi', country: 'UAE', aliases: ['HCT', 'الكليات التقنية'], faculties: ['Pharmacy'] },
  { id: 'uaeu', label: 'University of Sharjah', arabic: 'جامعة الشارقة', city: 'Sharjah', country: 'UAE', aliases: ['UoS', 'الشارقة'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'ajman', label: 'Ajman University', arabic: 'جامعة عجمان', city: 'Ajman', country: 'UAE', aliases: ['عجمان'], faculties: ['Medicine', 'Pharmacy'] },

  // ─── Kuwait ───
  { id: 'kuwait', label: 'Kuwait University', arabic: 'جامعة الكويت', city: 'Kuwait City', country: 'Kuwait', aliases: ['KU', 'الكويت'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'guc-kuwait', label: 'Gulf University for Science and Technology', arabic: 'جامعة الخليج للعلوم والتكنولوجيا', city: 'Kuwait City', country: 'Kuwait', aliases: ['GUST', 'الخليج للتكنولوجيا'], faculties: ['Pharmacy'] },
  { id: 'aau-kuwait', label: 'Al-Ahliyya University - Kuwait', arabic: 'جامعة الأهلية - الكويت', city: 'Kuwait City', country: 'Kuwait', aliases: ['AAU-KW'], faculties: ['Medicine'] },

  // ─── Bahrain ───
  { id: 'uob-bh', label: 'University of Bahrain', arabic: 'جامعة البحرين', city: 'Sakhir', country: 'Bahrain', aliases: ['UoB', 'البحرين'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'rcci', label: 'RCSI Medical University of Bahrain', arabic: 'جامعة RCSI الطبية - البحرين', city: 'Busaiteen', country: 'Bahrain', aliases: ['RCSI Bahrain'], faculties: ['Medicine'] },
  { id: 'aau-bh', label: 'Arab Open University - Bahrain', arabic: 'الجامعة العربية المفتوحة - البحرين', city: 'Manama', country: 'Bahrain', aliases: ['AOU-BH'], faculties: ['Pharmacy'] },

  // ─── Qatar ───
  { id: 'qatar', label: 'Weill Cornell Medicine - Qatar', arabic: 'ويل كورنيل للطب - قطر', city: 'Doha', country: 'Qatar', aliases: ['WCM-Q', 'كورنيل قطر'], faculties: ['Medicine'] },
  { id: 'cu-qatar', label: 'College of the North Atlantic - Qatar', arabic: 'كلية الشمال الأطلسي - قطر', city: 'Doha', country: 'Qatar', aliases: ['CNA-Q'], faculties: ['Pharmacy'] },
  { id: 'qu-qatar', label: 'Qatar University', arabic: 'جامعة قطر', city: 'Doha', country: 'Qatar', aliases: ['QU', 'قطر'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'hbku', label: 'Hamad Bin Khalifa University', arabic: 'جامعة حمد بن خليفة', city: 'Doha', country: 'Qatar', aliases: ['HBKU', 'حمد بن خليفة'], faculties: ['Medicine'] },

  // ─── Oman ───
  { id: 'sultan', label: 'Sultan Qaboos University', arabic: 'جامعة السلطان قابوس', city: 'Muscat', country: 'Oman', aliases: ['SQU', 'السلطان قابوس'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'ou', label: 'Oman Medical College', arabic: 'الكلية الطبية العمانية', city: 'Muscat', country: 'Oman', aliases: ['OMC', 'الكلية الطبية العمانية'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'gutech-om', label: 'German University of Technology in Oman', arabic: 'الجامعة الألمانية للتكنولوجيا في عمان', city: 'Muscat', country: 'Oman', aliases: ['GUtech'], faculties: ['Pharmacy'] },

  // ─── Yemen ───
  { id: 'sanaa', label: "University of Sana'a", arabic: 'جامعة صنعاء', city: "Sana'a", country: 'Yemen', aliases: ['صنعاء'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'aden', label: 'University of Aden', arabic: 'جامعة عدن', city: 'Aden', country: 'Yemen', aliases: ['عدن'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'hodeidah', label: 'University of Hodeidah', arabic: 'جامعة الحديدة', city: 'Al Hudaydah', country: 'Yemen', aliases: ['الحديدة'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'taiz', label: 'Taiz University', arabic: 'جامعة تعز', city: "Ta'izz", country: 'Yemen', aliases: ['تعز'], faculties: ['Medicine', 'Pharmacy'] },

  // ─── Iran ───
  { id: 'tehran', label: 'Tehran University of Medical Sciences', arabic: 'جامعة طهران للعلوم الطبية', city: 'Tehran', country: 'Iran', aliases: ['TUMS', 'طهران للعلوم الطبية'], faculties: ['Medicine', 'Pharmacy', 'Dentistry', 'Nursing'] },
  { id: 'shiraz', label: 'Shiraz University of Medical Sciences', arabic: 'جامعة شيراز للعلوم الطبية', city: 'Shiraz', country: 'Iran', aliases: ['SUMS', 'شيراز للعلوم الطبية'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'isfahan', label: 'Isfahan University of Medical Sciences', arabic: 'جامعة أصفهان للعلوم الطبية', city: 'Isfahan', country: 'Iran', aliases: ['MUI', 'أصفهان للعلوم الطبية'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'mashhad', label: 'Mashhad University of Medical Sciences', arabic: 'جامعة مشهد للعلوم الطبية', city: 'Mashhad', country: 'Iran', aliases: ['MUMS', 'مشهد للعلوم الطبية'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'shahid', label: 'Shahid Beheshti University of Medical Sciences', arabic: 'جامعة شهيد بهشتي للعلوم الطبية', city: 'Tehran', country: 'Iran', aliases: ['SBMU', 'شهيد بهشتي'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'tarbiat', label: 'Tarbiat Modares University', arabic: 'جامعة تربيت مدرس', city: 'Tehran', country: 'Iran', aliases: ['TMU', 'تربیت مدرس'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'iran', label: 'Iran University of Medical Sciences', arabic: 'جامعة إيران للعلوم الطبية', city: 'Tehran', country: 'Iran', aliases: ['IUMS', 'إيران للعلوم الطبية'], faculties: ['Medicine', 'Pharmacy', 'Nursing'] },
  { id: 'kerman', label: 'Kerman University of Medical Sciences', arabic: 'جامعة كرمان للعلوم الطبية', city: 'Kerman', country: 'Iran', aliases: ['كرمان للعلوم الطبية'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'tabriz', label: 'Tabriz University of Medical Sciences', arabic: 'جامعة تبريز للعلوم الطبية', city: 'Tabriz', country: 'Iran', aliases: ['تبريز للعلوم الطبية'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'ahvaz', label: 'Ahvaz Jundishapur University of Medical Sciences', arabic: 'جامعة أهواز جندي شابور للعلوم الطبية', city: 'Ahvaz', country: 'Iran', aliases: ['Ahvaz Jundishapur'], faculties: ['Medicine', 'Pharmacy'] },

  // ─── Turkey ───
  { id: 'istanbul', label: 'Istanbul University - Cerrahpaşa', arabic: 'جامعة إسطنبول - جراح باشا', city: 'Istanbul', country: 'Turkey', aliases: ['IUC', 'جراح باشا', 'Cerrahpasa'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'hacettepe', label: 'Hacettepe University', arabic: 'جامعة هاشتيبي', city: 'Ankara', country: 'Turkey', aliases: ['هوريه', 'Hacettepe'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'ankara', label: 'Ankara University', arabic: 'جامعة أنقرة', city: 'Ankara', country: 'Turkey', aliases: ['أنقرة'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'ege', label: 'Ege University', arabic: 'جامعة Ege', city: 'Izmir', country: 'Turkey', aliases: ['Ege', 'ايجة'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'gazi', label: 'Gazi University', arabic: 'جامعة غازي', city: 'Ankara', country: 'Turkey', aliases: ['غازي'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'ataturk', label: 'Atatürk University', arabic: 'جامعة أتاتورك', city: 'Erzurum', country: 'Turkey', aliases: ['أتاتورك'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'dicle', label: 'Dicle University', arabic: 'جامعة دicle', city: 'Diyarbakır', country: 'Turkey', aliases: ['دicle'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'uludağ', label: 'Uludağ University', arabic: 'جامعة أولوداغ', city: 'Bursa', country: 'Turkey', aliases: ['Uludag', 'أولوداغ'], faculties: ['Medicine', 'Pharmacy', 'Dentistry'] },
  { id: 'celal', label: 'Erciyes University', arabic: 'جامعة أرسيس', city: 'Kayseri', country: 'Turkey', aliases: ['أرسيس', 'Erciyes'], faculties: ['Medicine', 'Pharmacy'] },
  { id: 'karadeniz', label: 'Karadeniz Technical University', arabic: 'جامعة كارادينيز التقنية', city: 'Trabzon', country: 'Turkey', aliases: ['Karadeniz'], faculties: ['Medicine', 'Pharmacy'] },
]

export function filterUniversities(list, query) {
  if (!query) return list
  const q = query.toLowerCase()

  const scored = list.map(item => {
    let score = -1
    const label = item.label.toLowerCase()
    const arabic = (item.arabic || '').toLowerCase()
    const city = (item.city || '').toLowerCase()
    const country = (item.country || '').toLowerCase()

    // Exact match
    if (label === q || arabic === q) score = 100

    // Starts with
    if (score < 0 && (label.startsWith(q) || arabic.startsWith(q))) score = 90

    // Word starts with
    if (score < 0) {
      const words = label.split(/\s+/)
      if (words.some(w => w.startsWith(q))) score = 80
    }

    // Alias exact or starts with
    if (score < 0 && item.aliases) {
      for (const alias of item.aliases) {
        const al = alias.toLowerCase()
        if (al === q) { score = 70; break }
        if (al.startsWith(q)) { score = 60; break }
      }
    }

    // Includes in label
    if (score < 0 && label.includes(q)) score = 50

    // Includes in Arabic
    if (score < 0 && arabic.includes(q)) score = 40

    // Includes in alias
    if (score < 0 && item.aliases?.some(a => a.toLowerCase().includes(q))) score = 30

    // City match
    if (score < 0 && city.includes(q)) score = 20

    // Country match
    if (score < 0 && country.includes(q)) score = 10

    return { item, score }
  })

  return scored
    .filter(s => s.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aIdx = countryOrder.indexOf(a.item.country)
      const bIdx = countryOrder.indexOf(b.item.country)
      if (aIdx !== bIdx) return aIdx - bIdx
      return a.item.label.localeCompare(b.item.label)
    })
    .map(s => s.item)
}
