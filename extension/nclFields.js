/*
 * nclFields.js — Click & Continue (popup side)
 * ---------------------------------------------------------------------
 * NCL (Bihar / Central) ke liye jo extra fields popup form me nahi the, unko
 * "Form" tab ke andar ek naye section me jodta hai, aur unhe profile ke saath
 * SAVE / UPDATE / LOAD karta hai.
 * Saath me "Documents checklist" card bhi joda gaya hai jo vault ke saath sync hota hai.
 */
(function () {
  "use strict";
  if (window.__saathiNclFieldsLoaded) return;
  window.__saathiNclFieldsLoaded = true;

  const YESNO = [
    ["", "Select"], 
    ["1", "हाँ / Yes"], 
    ["2", "नहीं / No"]
  ];

  // NCL (Bihar) wali jaati-suchi
  const NCL_BIHAR_CASTES = [
    ["1", "Abdal / अब्दल"],
    ["3", "Aghori / अघोरी"],
    ["4", "Amaat / अमात"],
    ["5", "Kasab (Kasai) (Muslim) / कसाब (कसाई) (मुस्लिम)"],
    ["6", "Kewat, Keot / केवट, केउत"],
    ["7", "Kadar / कादर"],
    ["8", "Kaivartta/Kaibartta / कैवरता/कैबरता"],
    ["9", "Kalandar / कलन्दर"],
    ["10", "Kaura / कौरा"],
    ["12", "Kochh / कोच"],
    ["13", "Korku / कोरकु"],
    ["15", "Kurmi,Kurmi(Mahto) (in Chhotanagpur Division only) / कुर्मी, कुर्मी (महतो) केवल छोटानागपुर प्रमंडल में"],
    ["16", "Kagzi / कागजी"],
    ["17", "Kanu / कानु"],
    ["18", "Kamar (Lohar, Karmakar, Visvakarma) / कमार (लोहार, कर्मकार, विश्वकर्मा)"],
    ["19", "Kushwaha (Koeri) / कुशवाहा (कोइरी)"],
    ["20", "Kapadia / कपडिया"],
    ["21", "Kosta, Kostha / कोस्ता , कोश्त"],
    ["22", "Khatik / खटीक"],
    ["23", "Khangar / खंगर"],
    ["24", "Khatwa / खटवा"],
    ["25", "Khatwe / खतवे"],
    ["26", "Khadwar (Only in the district of Sivan and Rohtas) / खडवार (सिर्फ सिवान और रोहतास जिलें में)"],
    ["27", "Khetauri, Khatauri / खेतोडी, खतौडी"],
    ["28", "Khelta / खेलता"],
    ["29", "Godi (Chhava)/गोदी (चावा)"],
    ["30", "Gaddi/गद्दी"],
    ["31", "Gandarbh or Gandharb/गंधर्भ या गंधर्व"],
    ["32", "Gangai (Ganesh)/गंगई (गणेश)"],
    ["33", "Gangota, Gangoth/गंगोता, गंगोथ"],
    ["34", "Gorh,Gonrh (Only in the district of Saran & Rohtas)/गोरह, गोर्नह (केवल जिला सारण और रोहतास में)"],
    ["35", "Gulgaliya/गुलगलिया"],
    ["36", "Goud/गौंड"],
    ["37", "Ghatwar/घटवार"],
    ["38", "Chik (Muslim)/चिक (मुस्लिम)"],
    ["39", "Chain, Chayeen/चेन, चेईन"],
    ["40", "Chapota/चपोता"],
    ["41", "Chandrabanshi (Kahar)/चंद्रवंशी (कहार)"],
    ["42", "Churihar (Muslim)/चूरिहार (मुस्लिम)"],
    ["43", "Chanou/चनऊ"],
    ["44", "Jogi (Jugi)/जोगी (जुगी)"],
    ["45", "Tikulhar/टिकुलहार"],
    ["46", "Dafali (Muslim)/डफली (मुस्लिम)"],
    ["47", "Dhekaru/देकारू"],
    ["48", "Tanti (Tatwa), Tati, Tatin/तांती(ततवा),ताती, तातीन"],
    ["49", "Turha/तुरहा"],
    ["50", "Tamariya/तमडिया"],
    ["51", "Tiyar/तियार"],
    ["52", "Tamoli, Tamboli/तमोली, तामबोली"],
    ["53", "Teli/तेली"],
    ["55", "Devhar/देवहर"],
    ["56", "Dhanuk/धानुक"],
    ["57", "Dhobi (Muslim)/धोबी (मुस्लिम)"],
    ["58", "Dhunia (Muslim)/धुनिया (मुस्लिम)"],
    ["59", "Dhamin/धामिन"],
    ["60", "Dhankar/धनकार"],
    ["61", "Dhimar/धीमर"],
    ["62", "Nai/नाई"],
    ["63", "Nat (Muslim)/नट (मुस्लिम)"],
    ["64", "Nunia, Nonia /नुनिया, नोनिया"],
    ["65", "Namshudra/नमशुद्रा"],
    ["66", "Naiya/नैया"],
    ["67", "Nalband (Muslim) / नालबंद (मुस्लिम)"],
    ["68", "Pamaria (Muslim)/पमरिया (मुस्लिम)"],
    ["69", "Prajapati (Kumbhar)/प्रजापति(कुम्हार)"],
    ["70", "Pandi / पन्दी"],
    ["71", "Pinganiya/पिंगानिया"],
    ["72", "Parya/परेया"],
    ["73", "Pradhan/प्रधान"],
    ["74", "Pahira /पाहिरा"],
    ["75", "pal (Bherihar-Gaderi), Gaderia/पाल(भेरियार-गडेरी) गडेरिया"],
    ["76", "Shekhra / शेखड़ा"],
    ["77", "Bagdi/बागदी"],
    ["78", "Bari/बारी"],
    ["79", "Beldar/बेलदार"],
    ["80", "Bind / बिन्द"],
    ["81", "Barhai (Viswakarma)/ बढ़ई(विश्वकर्मा)"],
    ["82", "Barai/बरई"],
    ["83", "Sudi, Halwai, Roniyar, Pansari, Modi, Kasera,Kesarwani, Thathera, Patwa, Sinduriya-Bania,Mahuri-Vaishya, Avadh-Bania, Agrahari-Vaishya/सुदी, हलवाई, रोनियार, पनसारी, मोदी, कसेरा, केशरवानी, ठठेरा, पतवा, सिन्दुरिया-बनिया, माहुरी-वैश्य-अवध-बनिया, अग्रहारी-वैश्य"],
    ["84", "Bhathiara (Muslim)/भथिआरा (मुस्लिम)"],
    ["85", "Bhar/भर"],
    ["86", "Bhaskar / भास्कर"],
    ["87", "Bhuihar, Bhuiyar/भुइहार, भुइयार"],
    ["88", "Bhat, Bhatt/भाट, भट्ट"],
    ["89", "Mali (Malakar)/माली (मालाकार)"],
    ["90", "Mallah (Surhiya,Kewat Murawari)/मल्लाह (सुरहिया, केवट, मुरवारी)"],
    ["91", "Madari (Muslim)/मदारी (मुस्लिम)"],
    ["92", "Mehtar, Lalbegi (Muslim), Halalkhor, Bhangi /मेहतर, लालबेगी (मुस्लिम), हलालखोर, भंगी"],
    ["93", "Miriasin (Muslim)/मिरियासिन (मुस्लिम)"],
    ["94", "Majhwar/मझवार"],
    ["95", "Malar (Malhar)/मलार (मलहार)"],
    ["96", "Mangar (Magar)/मंगर (मगर)"],
    ["97", "Markande / मारकण्डे"],
    ["98", "Maulik/मौलिक"],
    ["99", "Mukri (Mukeri) (Muslim)/मुकरी (मुकेरी) (मुस्लिम)"],
    ["100", "Madar/मदार"],
    ["101", "Mauriaro, Mauriara/मौरिआरों, मौरिआरा"],
    ["102", "Mirshikar (Muslim)/मीरशीकार (मुस्लिम)"],
    ["103", "Momin (Muslim),Ansari,Julaha/मोमिन (मुस्लिम) ,अंसारी ,जुलाहा"],
    ["104", "Yadav (Gwala,Ahir,Gope, Sadgope)/यादव(ग्वाला, अहीर,गोप सदगोप)"],
    ["105", "Rajbhar/राजभर"],
    ["106", "Rajdhobi/राजधोबी"],
    ["107", "Rajbanshi (Risiya & Poliya)/राजवंशी(रिसिया एवं पोलिया)"],
    ["108", "Rangwa/रंगवा"],
    ["109", "Rangrez/रंगरेज (मुस्लिम)"],
    ["110", "Rauttiya/रौतिया"],
    ["111", "Rayeen or Kunjra (Muslim) / राईन या कुंजरा (मुस्लिम)"],
    ["112", "Laheri/लहेरी"],
    ["113", "Banpar/बनपार"],
    ["114", "Shivhari/शिवहारी"],
    ["115", "Sauta (Sota)/सौता (सोता)"],
    ["116", "Sayee (Muslim) /साई (मुस्लिम)"],
    ["117", "Sonar , Sunar/सोनार, सुनार"],
    ["118", "Sangatrash(only in the district of Nawadah)/संगात्रस(केवल नवादा जिला में)"],
    ["119", "Idrisi or Darzi (Muslim)/इदरिसी या दर्जी (मुस्लिम)"],
    ["120", "Christain converts from Scheduled Caste/अनुसूचित जातियों से ईसाई धर्म में परिवर्तित"],
    ["121", "Christain converts from Other Backward Class/अन्य पिछड़े वर्गों से ईसाई धर्म में परिवर्तित"],
    ["122", "Dhanwar/धानवार"],
    ["123", "Dangi/दांगी"],
    ["124", "Kalwar / कलवार"],
    ["125", "Kulahia/कुल्हैया"],
    ["126", "Shershahbadi /शेरशाहवादी"],
    ["127", "Sukiyar/सुकियार"],
    ["128", "Nagar (This does not include Maithili Brahmins and immigrant Nagars from other States who are Brahmins and Baniyas)/नागर (इसमें मैथिली ब्राह्मण शामिल नहीं है और दूसरे राज्यों के अप्रवासी नागर ब्राह्मण और बनिया है।)"],
    ["129", "Saikalgar (Sikligar) (Muslim)/साइकलगार(सिकलीगार)(मुस्लिम)"],
    ["130", "Bakho (Muslim)/बख्खो (मुस्लिम)"],
    ["131", "Thakurai (Muslim) / ठकुराई (मुस्लिम)"],
    ["132", "Adrakhi/अद्राखी"],
    ["133", "Soyar/सोयार"],
    ["135", "Chhipi/छीपी"],
    ["136", "ltfarosh/ttaftrosh/Gadheri/ईटफरोश/ईटाफरोश /गदहेडी"],
    ["199", "Kalal, Eraqui / कलाल , इराकी"]
  ];

  // NCL (Central) page ki jaati-suchi
  const NCL_CENTRAL_CASTES = [
    ["1", "Abdal / अब्दल"],
    ["3", "Aghori / अघोरी"],
    ["4", "Amaat / अमात"],
    ["5", "Kasab (Kasai) / कसाब (कसाई) (मुस्लिम)"],
    ["6", "Kewat, Keot / केवट, केउत"],
    ["7", "Kadar / कादर"],
    ["8", "Kaivartta / कैवरता/कैबरता"],
    ["9", "Kalandar / कलन्दर"],
    ["10", "Kaura / कौरा"],
    ["12", "Kochh / कोच"],
    ["13", "Korku / कोरकु"],
    ["15", "Kurmi, Kurmi (Mahto) / कुर्मी, कुर्मी (महतो) केवल छोटानागपुर प्रमंडल में"],
    ["16", "Kagzi / कागजी"],
    ["17", "Kanu / कानु"],
    ["18", "Kamar (Lohar) / कमार (लोहार, कर्मकार, विश्वकर्मा)"],
    ["19", "Kushwaha (Koeri) / कुशवाहा (कोइरी)"],
    ["20", "Kapadia / कपडिया"],
    ["21", "Kosta, Kostha / कोस्ता , कोश्त"],
    ["22", "Khatik / खटीक"],
    ["23", "Khangar / खंगर"],
    ["24", "Khatwa / खटवा"],
    ["25", "Khatwe / खतवे"],
    ["26", "Khadwar (Only in the district of Sivan and Rohtas) / खडवार (सिर्फ सिवान और रोहतास जिलें में)"],
    ["27", "Khetauri, Khatauri / खेतोडी, खतौडी"],
    ["28", "Khelta / खेलता"],
    ["29", "Godi (Chhava) / गोदी (चावा)"],
    ["30", "Gaddi / गद्दी"],
    ["31", "Gandarbh or Gandharb / गंधर्भ या गंधर्व"],
    ["32", "Gangai (Ganesh) / गंगई (गणेश)"],
    ["33", "Gangota, Gangoth / गंगोता, गंगोथ"],
    ["34", "Gorh, Gonrh (Only in the district of Saran & Rohtas) / गोरह, गोर्नह (केवल जिला सारण और रोहतास में)"],
    ["35", "Gulgaliya / गुलगलिया"],
    ["36", "Goud / गौंड"],
    ["37", "Ghatwar / घटवार"],
    ["38", "Chik (Muslim) / चिक (मुस्लिम)"],
    ["39", "Chain, Chayeen / चेन, चेईन"],
    ["40", "Chapota / चपोता"],
    ["41", "Chandrabanshi (Kahar) / चंद्रवंशी (कहार)"],
    ["42", "Churihar (Muslim) / चूरिहार (मुस्लिम)"],
    ["43", "Chanou / चनऊ"],
    ["44", "Jogi (Jugi) / जोगी (जुगी)"],
    ["45", "Tikulhar / टिकुलहार"],
    ["46", "Dafali (Muslim) / डफली (मुस्लिम)"],
    ["47", "Dhekaru / देकारू"],
    ["48", "Tanti , Tati, Tatin (Tatwa) / तांती(ततवा),ताती, तातीन"],
    ["49", "Turha / तुरहा"],
    ["50", "Tamariya / तमडिया"],
    ["51", "Tiyar / तियार"],
    ["52", "Tamoli, Tamboli / तमोली, तामबोली"],
    ["53", "Teli / तेली"],
    ["55", "Devhar / देवहर"],
    ["56", "Dhanuk / धानुक"],
    ["57", "Dhobi (Muslim) / धोबी (मुस्लिम)"],
    ["58", "Dhunia (Muslim) / धुनिया (मुस्लिम)"],
    ["59", "Dhamin / धामिन"],
    ["60", "Dhankar / धनकार"],
    ["61", "Dhimar / धीमर"],
    ["62", "Nai / नाई"],
    ["63", "Nat (Muslim) / नट (मुस्लिम)"],
    ["64", "Nunia, Nonia / नुनिया, नोनिया"],
    ["65", "Namshudra / नमशुद्रा"],
    ["66", "Naiya / नैया"],
    ["67", "Nalband (Muslim) / नालबंद (मुस्लिम)"],
    ["68", "Pamaria (Muslim) / पमरिया (मुस्लिम)"],
    ["69", "Prajapati (Kumbhar) / प्रजापति(कुम्हार)"],
    ["70", "Pandi / पन्दी"],
    ["71", "Pinganiya / पिंगानिया"],
    ["72", "Parya / परेया"],
    ["73", "Pradhan / प्रधान"],
    ["74", "Pahira / पाहीरा"],
    ["75", "pal , Gaderia (Bherihar-Gaderi) / पाल(भेरियार-गडेरी) गडेरिया"],
    ["76", "Shekhra / शेखड़ा"],
    ["77", "Bagdi / बागदी"],
    ["78", "Bari / बारी"],
    ["79", "Beldar / बेलदार"],
    ["80", "Bind / बिन्द"],
    ["81", "Barhai (Viswakarma) / बढ़ई(विश्वकर्मा)"],
    ["82", "Barai / बरई"],
    ["83", "Sudi, Halwai, Roniyar, Pansari, Modi, Kasera, Kesarwani, Thathera, Patwa, Sinduriya-Bania, Mahuri-Vaishya, Avadh-Bania, Agrahari-Vaishya / सुदी, हलवाई, रोनियार, पनसारी, मोदी, कसेरा, केशरवानी, ठठेरा, पतवा, सिन्दुरिया-बनिया, माहुरी-वैश्य-अवध-बनिया, अग्रहारी-वैश्य"],
    ["84", "Bhathiara (Muslim) / भथिआरा (मुस्लिम)"],
    ["85", "Bhar / भर"],
    ["86", "Bhaskar / भास्कर"],
    ["87", "Bhuihar, Bhuiyar / भुइहार, भुइयार"],
    ["88", "Bhat, Bhatt / भाट, भट्ट"],
    ["89", "Mali (Malakar) / माली (मालाकार)"],
    ["90", "Mallah (Surhiya) / मल्लाह (सुरहिया, केवट, मुरवारी)"],
    ["91", "Madari (Muslim) / मदारी (मुस्लिम)"],
    ["92", "Mehtar, Lalbegi , Halalkhor, Bhangi (Muslim) / मेहतर, लालबेगी (मुस्लिम), हलालखोर, भंगी"],
    ["93", "Miriasin (Muslim) / मिरियासिन (मुस्लिम)"],
    ["94", "Majhwar / मझवार"],
    ["95", "Malar (Malhar) / मलार (मलहार)"],
    ["96", "Mangar (Magar) / मंगर (मगर)"],
    ["97", "Markande / मारकण्डे"],
    ["98", "Maulik / मौलिक"],
    ["99", "Mukri (Mukeri) / मुकरी (मुकेरी) (मुस्लिम)"],
    ["100", "Madar / मदार"],
    ["101", "Mauriaro, Mauriara / मौरिआरों, मौरिआरा"],
    ["102", "Mirshikar (Muslim) / मीरशीकार (मुस्लिम)"],
    ["103", "Momin ,Ansari,Julaha (Muslim) / मोमिन (मुस्लिम) ,अंसारी ,जुलाहा"],
    ["104", "Yadav (Gwala, Ahir, Gope, Sadgope) / यादव(ग्वाला, अहीर, गोप सदगोप)"],
    ["105", "Rajbhar / राजभर"],
    ["106", "Rajdhobi / राजधोबी"],
    ["107", "Rajbanshi (Risiya & Poliya) / राजवंशी(रिसिया एवं पोलिया)"],
    ["108", "Rangwa / रंगवा"],
    ["109", "Rangrez (Muslim) / रंगरेज (मुस्लिम)"],
    ["110", "Rauttiya / रौतिया"],
    ["111", "Rayeen or Kunjra (Muslim) / राईन या कुंजरा (मुस्लिम)"],
    ["112", "Laheri / लहेरी"],
    ["113", "Banpar / बनपार"],
    ["114", "Shivhari / शिवहारी"],
    ["115", "Sauta (Sota) / सौता (सोता)"],
    ["116", "Sayee (Muslim) / साई (मुस्लिम)"],
    ["117", "Sonar , Sunar / सोनार, सुनार"],
    ["118", "Sangatrash (only in the district of Nawadah) / संगात्रस(केवल नवादा जिला में)"],
    ["119", "Idrisi or Darzi (Muslim) / इदरिसी या दर्जी (मुस्लिम)"],
    ["120", "Christain converts from Scheduled Caste / अनुसूचित जातियों से ईसाई धर्म में परिवर्तित"],
    ["121", "Christain converts from Other Backward Class / अन्य पिछड़े वर्गों से ईसाई धर्म में परिवर्तित"],
    ["122", "Dhanwar / धनवार"],
    ["123", "Dangi / दांगी"],
    ["124", "Kalwar / कलवार"],
    ["125", "Kulahia / कुल्हैया"],
    ["126", "Shershahbadi / शेरशाहवादी"],
    ["127", "Sukiyar / सुकियार"],
    ["128", "Nagar (This does not include Maithili Brahmins and immigrant Nagars from other States who are Brahmins and Baniyas) / नागर (इसमें मैथिली ब्राह्मण शामिल नहीं है...)"],
    ["129", "Saikalgar (Sikligar) / साइकलगार(सिकलीगार)(मुस्लिम)"],
    ["130", "Bakho (Muslim) / बख्खो (मुस्लिम)"],
    ["131", "Thakurai (Muslim) / ठकुराई (मुस्लिम)"],
    ["132", "Adrakhi / अद्राखी"],
    ["133", "Soyar / सोयार"],
    ["135", "Chhipi / छीपी"],
    ["136", "ltfarosh / ईटफरोश/ईटाफरोश /गदहेडी"],
    ["199", "Kalal, Eraqui / कलाल , इराकी"]
  ];

  // Sub-castes mapping
  const NCL_CENTRAL_SUB_EXTRA = {
    "18": [
      "Kamar (Lohar) / कमार (लोहार, कर्मकार, विश्वकर्मा)",
      "Kamar (Karmakar) / कमार (लोहार, कर्मकार, विश्वकर्मा)",
      "Kamar (Visvakarma) / कमार (लोहार, कर्मकार, विश्वकर्मा)"
    ],
    "90": [
      "Mallah (Surhiya) / मल्लाह (सुरहिया, केवट, मुरवारी)",
      "Mallah (Kewat Murawari) / मल्लाह (सुरहिया, केवट, मुरवारी)"
    ],
    "104": [
      "Yadav (Gwala) / यादव(ग्वाला)",
      "Yadav (Ahir) / यादव(अहीर)",
      "Yadav (Gope) / यादव(गोप)",
      "Yadav (Sadgope) / यादव(सदगोप)"
    ]
  };

  function bundledSubs(id) {
    const extra = NCL_CENTRAL_SUB_EXTRA[String(id)] || [];
    if (extra.length > 0) {
      return extra.map((p) => [String(id), p]);
    }
    const c = NCL_CENTRAL_CASTES.find((x) => x[0] === String(id));
    if (!c) return [];
    return [[String(id), c[1]]];
  }

  const subKey = (t) => String(t == null ? "" : t).split("/")[0].toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, "");

  const FIELDS = [
    { key: "ncl_dob", label: "जन्म तिथि ", type: "text", ph: "25/12/1990" },
    { key: "ncl_aadhaar", label: "आधार संख्या (Optional)", type: "text", ph: "", max: 12 },
    { key: "ncl_religion", label: "धर्म ", type: "text", ph: "Hindu" },
    { key: "ncl_salutation", label: "अभिवादन", type: "select",
      opts: [["", "Select"], ["1", "श्री"], ["2", "श्रीमती"], ["3", "सुश्री"], ["4", "कोई अभिवादन नहीं"]] },
    { key: "ncl_occupation", label: "पेशा (NCL)", type: "select",
      opts: [["", "Please Select"], ["1", "छात्र / Student"], ["2", "सरकारी सेवा / Govt. Service"],
             ["3", "निजी सेवा / Private Service"], ["4", "व्यापार / Business"], ["5", "किसान / Farmer"],
             ["6", "गृहिणी / Housewife"], ["7", "अन्य / Others"]] },
    { key: "ncl_occupationOther", label: "पेशा 'अन्य'उल्लेख करें", type: "text" },
    { key: "ncl_holding", label: "होल्डिंग न. (Optional)", type: "text" },
    { key: "ncl_circle", label: "सर्किल न. (Optional)", type: "text" },
    { key: "ncl_oldCert", label: "पहले से निर्गत प्रमाण-पत्र (Bihar)", type: "select",
      opts: [["1", "नहीं / No"], ["2", "हाँ / Yes"]] },
    { key: "ncl_pension", label: "पेंशन से आय", type: "text" },
    { key: "ncl_taxPaid", label: "कर भुगतान करते हैं (Bihar)", type: "select", opts: YESNO },
    { key: "ncl_certFormat", label: " प्रमाण-पत्र की भाषा [Central]", type: "select",
      opts: [["1", "हिंदी / Hindi"], ["2", "अंग्रेजी / English"]] },
    { key: "ncl_commissionary", label: " प्रमंडल [Central]", type: "select",
      opts: [["", "Please Select"], ["1257617", "BHAGALPUR / भागलपुर"], ["1257611", "DARBHANGA / दरभंगा सदर"],
             ["1257612", "KOSHI / कोसी"], ["1257610", "MAGADH / मगध"], ["1257613", "MUNGER / मुंगेर"],
             ["1257618", "PATNA / पटना"], ["1257614", "PURNIA / पुर्णिया"], ["1257615", "SARAN / सारण"],
             ["1257616", "TIRHUT / तिरहुत"]] },
    { 
      key: "ncl_centralCaste", 
      label: " जाति [Central]", 
      type: "select",
      opts: [["", "Please Select"]].concat(NCL_CENTRAL_CASTES) 
    },
    { key: "ncl_centralSubCaste", label: " उप-जाति [Central] ", type: "subselect" },
    { key: "ncl_itReturn", label: " आयकर रिटर्न भरते हैं [Central]", type: "select", opts: YESNO },
    { key: "ncl_propTax", label: " सम्पत्ति कर के अंतर्गत हैं [Central]", type: "select", opts: YESNO },
    { key: "ncl_fatherSameCaste", label: " पिता की जाति = आवेदक की जाति [Central]", type: "checkbox", def: true },

    // ---- Documents checklist hidden fields ----
    { key: "doc_ncl_form13_residence", label: "Form-XIII आवास प्रमाण-पत्र", type: "checkbox", def: false, doc: true },
    { key: "doc_ncl_form4_caste", label: "Form-IV जाति प्रमाण-पत्र", type: "checkbox", def: false, doc: true },
    { key: "doc_ncl_form16_income", label: "Form-XVI आय प्रमाण-पत्र", type: "checkbox", def: false, doc: true },
    { key: "doc_ncl_b_affidavit_form11", label: "Form-XI-आवेदक का स्वयं शपथ पत्र", type: "checkbox", def: false, doc: true },
    { key: "doc_ncl_c_affidavit_form8", label: "[Central] Form-VIII स्वयं शपथ पत्र", type: "checkbox", def: false, doc: true },
    { key: "doc_ncl_b_irrigated_land_pct", label: "सिंचित जमीन का प्रतिशत (बिहार सरकार के सिलिंग कानून के अंतर्गत)", type: "checkbox", def: false, doc: true },
    { key: "doc_autoSave", label: "Docs lagane ke baad Save Annexure bhi karo", type: "checkbox", def: true, doc: true }
  ];

  // Card me dikhne wale documents (Aapke image ke anusaar exact naam aur keys)
  const DOC_ITEMS = [
    { key: "ncl_b_affidavit_form11", icon: "✍️", title: "Form-XI-आवेदक का स्वयं शपथ पत्र", form: "Form-XI", svc: ["b"] },
    { key: "ncl_c_affidavit_form8", icon: "✍️", title: "Form-VIII-आवेदक का स्वयं शपथ पत्र (केंद्र)", form: "Form-VIII", svc: ["c"] },
    { key: "ncl_form13_residence", icon: "🏠", title: "Form-XIII-आवास प्रमाण-पत्र", form: "Form-XIII", svc: ["b", "c"] },
    { key: "ncl_form4_caste", icon: "🪪", title: "Form-IV-जाति प्रमाण-पत्र", form: "Form-IV", svc: ["b", "c"] },
    { key: "ncl_form16_income", icon: "💰", title: "Form-XVI-आय प्रमाण-पत्र", form: "Form-XVI", svc: ["b", "c"] },
    { key: "ncl_b_irrigated_land_pct", icon: "🌾", title: "सिंचित जमीन का प्रतिशत (बिहार सरकार के सिलिंग कानून के अंतर्गत)", form: "सिलिंग कानून", svc: ["b"] },
  ];
  const SVC_TABS = [["all", "सभी"], ["b", "NCL बिहार"], ["c", "NCL केंद्र"]];
  const SVC_TAG = { b: "बिहार", c: "केंद्र" };

  const elId = (key) => "f_" + key;

  function buildField(f) {
    const grp = document.createElement("div");
    grp.className = "form-group";
    if (f.doc) grp.style.display = "none"; // hidden form inputs for saving/loading profile
    const lab = document.createElement("label");
    lab.setAttribute("for", elId(f.key));
    lab.textContent = f.label;
    grp.appendChild(lab);
    
    let inp;
    if (f.type === "select") {
      inp = document.createElement("select");
      f.opts.forEach(([v, t], i) => {
        const o = document.createElement("option");
        o.value = v; 
        o.textContent = t;
        if (i === 0) o.defaultSelected = true;
        inp.appendChild(o);
      });
    } else if (f.type === "subselect") {
      inp = document.createElement("select");
      const o = document.createElement("option");
      o.value = ""; 
      o.textContent = "Please Select";
      o.defaultSelected = true;
      inp.appendChild(o);
    } else if (f.type === "checkbox") {
      inp = document.createElement("input");
      inp.type = "checkbox";
      inp.defaultChecked = !!f.def;
      inp.checked = !!f.def;
      inp.style.width = "auto";
    } else {
      inp = document.createElement("input");
      inp.type = "text";
      if (f.ph) inp.placeholder = f.ph;
      if (f.max) inp.maxLength = f.max;
    }
    inp.id = elId(f.key);
    grp.appendChild(inp);
    return grp;
  }

  /* ------------------------------------------------------------------
   * Documents checklist card UI & Logic
   * ---------------------------------------------------------------- */
  const STYLE_ID = "saathiNclDocStyle";
  let svcTab = "all";
  let vaultKeys = new Set();

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      .nd-card { grid-column: span 3; background: var(--card-bg, #fff); border: 1.5px solid var(--border-color, #dfe5ee);
        border-radius: 14px; padding: 12px; margin-top: 4px; box-shadow: var(--shadow-card, 0 6px 18px -12px rgba(20,32,58,.35)); }
      .nd-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .nd-title { flex: 1; font-size: 12.5px; font-weight: 800; color: var(--accent-navy, #1c2b4a); }
      .nd-pill { font-size: 10px; font-weight: 800; padding: 2px 9px; border-radius: 999px; background: var(--input-bg, #eef2f8); color: var(--text-primary, #1c2b4a); }
      .nd-pill.ok { background: #1f9d63; color: #fff; }
      .nd-bar { height: 6px; border-radius: 999px; background: var(--input-bg, #eef2f8); overflow: hidden; margin-bottom: 10px; }
      .nd-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #2f6fb8, #1f9d63); transition: width .25s ease; }
      .nd-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
      .nd-tab { border: 1.5px solid var(--border-color, #dfe5ee); background: transparent; color: var(--text-muted, #5b6b85);
        border-radius: 999px; padding: 4px 11px; font-size: 10.5px; font-weight: 700; cursor: pointer; }
      .nd-tab.on { background: var(--accent-navy, #1c2b4a); color: #fff; border-color: transparent; }
      .nd-quick { margin-left: auto; display: flex; gap: 6px; }
      .nd-link { border: none; background: none; cursor: pointer; font-size: 10px; font-weight: 700; color: var(--accent-navy, #2b4f81); padding: 2px 4px; text-decoration: underline; }
      .nd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
      .nd-item { position: relative; display: flex; flex-direction: column; gap: 3px; text-align: left; cursor: pointer;
        padding: 10px 10px 9px 38px; border: 1.5px solid var(--border-color, #dfe5ee); border-radius: 12px;
        background: var(--input-bg, #f6f8fc); color: var(--text-primary, #1c2b4a); transition: transform .12s ease, border-color .12s ease, background .12s ease; }
      .nd-item:hover { transform: translateY(-1px); border-color: var(--accent-navy, #2b4f81); }
      .nd-item.on { border-color: #1f9d63; background: rgba(31,157,99,.10); }
      .nd-item.warn { border-color: #d99a1f; background: rgba(217,154,31,.12); }
      .nd-box { position: absolute; left: 10px; top: 12px; width: 18px; height: 18px; border-radius: 4px;
        border: 2px solid var(--text-muted, #8a97ad); display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 900; color: #fff; background: #fff; }
      .nd-item.on .nd-box { background: #1f9d63; border-color: #1f9d63; }
      .nd-item.warn .nd-box { background: #d99a1f; border-color: #d99a1f; }
      .nd-name { font-size: 11px; font-weight: 700; line-height: 1.25; }
      .nd-meta { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; font-size: 9px; color: var(--text-muted, #5b6b85); }
      .nd-form { font-weight: 800; padding: 0 6px; border-radius: 999px; background: rgba(43,79,129,.12); color: var(--accent-navy, #2b4f81); }
      .nd-svc { font-weight: 700; opacity: .85; }
      .nd-state { font-size: 9.5px; font-weight: 700; margin-top: 2px; }
      .nd-state.have { color: #1c8a5a; }
      .nd-state.need { color: #b57a00; }
      .nd-state.none { color: var(--text-muted, #5b6b85); }
      .nd-foot { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
      .nd-switch { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; font-size: 10.5px; font-weight: 700; color: var(--text-primary, #1c2b4a); user-select: none; }
      .nd-sw { position: relative; width: 32px; height: 18px; border-radius: 999px; background: var(--border-color, #c9d2e0); transition: background .15s; flex-shrink: 0; }
      .nd-sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
      .nd-switch.on .nd-sw { background: #1f9d63; }
      .nd-switch.on .nd-sw::after { transform: translateX(14px); }
      .nd-hint { font-size: 9.5px; color: var(--text-muted, #5b6b85); width: 100%; }
    `;
    document.head.appendChild(st);
  }

  const dEl = (key) => document.getElementById(elId("doc_" + key));
  const isTicked = (key) => { const e = dEl(key); return !!(e && e.checked); };
  const autoSaveEl = () => document.getElementById(elId("doc_autoSave"));

  function setTick(key, val) {
    const e = dEl(key);
    if (!e) return;
    if (e.checked !== val) {
      e.checked = val;
      e.dispatchEvent(new Event("change", { bubbles: true }));
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }
    renderCard();
  }

  function visibleItems() {
    return DOC_ITEMS.filter((d) => svcTab === "all" || d.svc.indexOf(svcTab) !== -1);
  }

  function renderCard() {
    const card = document.getElementById("nclDocCard");
    if (!card) return;
    const items = visibleItems();
    const ticked = items.filter((d) => isTicked(d.key)).length;
    const inVault = items.filter((d) => vaultKeys.has(d.key)).length;
    const missing = items.filter((d) => isTicked(d.key) && !vaultKeys.has(d.key)).length;
    const pct = items.length ? Math.round((ticked / items.length) * 100) : 0;
    const auto = autoSaveEl();
    const autoOn = !!(auto && auto.checked);

    const tabs = SVC_TABS.map(([k, l]) =>
      `<button type="button" class="nd-tab${svcTab === k ? " on" : ""}" data-nd="tab" data-k="${k}">${l}</button>`).join("");

    const grid = items.map((d) => {
      const on = isTicked(d.key);
      const have = vaultKeys.has(d.key);
      const cls = on ? (have ? "on" : "warn") : "";
      const state = have
        ? `<span class="nd-state have">✓ Doc Vault me hai</span>`
        : on
          ? `<span class="nd-state need" data-nd="vault">⚠ Vault me upload nahi — upload karein ›</span>`
          : `<span class="nd-state none">Vault me nahi hai</span>`;
      const tags = d.svc.map((s) => SVC_TAG[s]).join(" · ");
      return `
        <div class="nd-item ${cls}" role="checkbox" aria-checked="${on}" tabindex="0" data-nd="item" data-key="${d.key}">
          <span class="nd-box">${on ? "✓" : ""}</span>
          <span class="nd-name">${d.icon} ${d.title}</span>
          <span class="nd-meta"><span class="nd-form">${d.form}</span><span class="nd-svc">${tags}</span></span>
          ${state}
        </div>`;
    }).join("");

    card.innerHTML = `
      <div class="nd-head">
        <div class="nd-title">📎 Documents checklist — customer ke paas kaun se docs hain</div>
        <span class="nd-pill${ticked && !missing ? " ok" : ""}">${ticked}/${items.length} tick</span>
        <span class="nd-pill">🗂️ ${inVault} Vault me</span>
      </div>
      <div class="nd-bar"><i style="width:${pct}%"></i></div>
      <div class="nd-tabs">
        ${tabs}
        <span class="nd-quick">
          <button type="button" class="nd-link" data-nd="allvault">Vault wale sab tick</button>
          <button type="button" class="nd-link" data-nd="clear">Sab hatao</button>
        </span>
      </div>
      <div class="nd-grid">${grid}</div>
      <div class="nd-foot">
        <span class="nd-switch${autoOn ? " on" : ""}" role="switch" aria-checked="${autoOn}" tabindex="0" data-nd="auto">
          <span class="nd-sw"></span>Update Page ke baad Save Annexure bhi karo
        </span>
        <div class="nd-hint">Form "Fill" karne par site par yahi tick kiye docs select + attach honge${autoOn ? ", phir Save Annexure khud dab jayega" : ""}.${missing ? ` ⚠ ${missing} tick kiye doc Vault me upload nahi hain.` : ""}</div>
      </div>`;
  }

  let vaultOwner = null;
  async function refreshVault() {
    try {
      if (typeof DocStore !== "undefined") {
        const id = await DocStore.getActiveProfileId();
        const docs = await DocStore.getCustomerDocs(id);
        const next = new Set(Object.keys(docs || {}));
        // a document that has JUST been added to the same customer's vault gets ticked automatically
        if (vaultOwner === id) {
          next.forEach((k) => { if (!vaultKeys.has(k) && DOC_ITEMS.some((d) => d.key === k)) setTick(k, true); });
        }
        vaultOwner = id;
        vaultKeys = next;
      }
    } catch (e) { /* ignore */ }
    renderCard();
  }

  function onCardClick(e) {
    const t = e.target.closest("[data-nd]");
    if (!t) return;
    const act = t.dataset.nd;
    if (act === "vault") {
      e.stopPropagation();
      if (typeof SaathiExtraTabs !== "undefined" && SaathiExtraTabs.show) SaathiExtraTabs.show("tab-vault");
      return;
    }
    if (act === "tab") { svcTab = t.dataset.k; renderCard(); return; }
    if (act === "item") { 
      const key = t.dataset.key;
      setTick(key, !isTicked(key)); 
      return; 
    }
    if (act === "allvault") { visibleItems().forEach((d) => { if (vaultKeys.has(d.key)) setTick(d.key, true); }); renderCard(); return; }
    if (act === "clear") { visibleItems().forEach((d) => setTick(d.key, false)); renderCard(); return; }
    if (act === "auto") {
      const a = autoSaveEl();
      if (a) { a.checked = !a.checked; a.dispatchEvent(new Event("change", { bubbles: true })); }
      renderCard();
    }
  }

  function onCardKey(e) {
    if (e.key !== " " && e.key !== "Enter") return;
    const t = e.target.closest("[data-nd='item'],[data-nd='auto']");
    if (!t) return;
    e.preventDefault();
    t.click();
  }

  function buildCard() {
    const card = document.createElement("div");
    card.id = "nclDocCard";
    card.className = "nd-card";
    card.addEventListener("click", onCardClick);
    card.addEventListener("keydown", onCardKey);
    return card;
  }

  function wireCardRefresh() {
    if (wireCardRefresh.done) return;
    wireCardRefresh.done = true;
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(refreshVault, 150); };
    try {
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== "local") return;
        if (ch.saathiDocStoreByProfile || ch.saathiActiveProfileId || ch.saathiCustomers) later();
      });
    } catch (e) { /* ignore */ }
    const form = document.getElementById("dataForm");
    if (form) form.addEventListener("reset", () => setTimeout(renderCard, 0));
  }

  function inject() {
    if (document.getElementById("nclExtraSection")) return true;
    const cont = document.querySelector("#dataForm .form-container");
    if (!cont) return false;
    const anchor = cont.querySelector(".form-actions");

    const head = document.createElement("div");
    head.className = "form-group";
    head.id = "nclExtraSection";
    head.setAttribute("style", "grid-column: span 3;");
    const h3 = document.createElement("h3");
    h3.textContent = "NCL (Bihar / Central) ke extra details";
    head.appendChild(h3);

    const frag = document.createDocumentFragment();
    frag.appendChild(head);
    FIELDS.forEach((f) => frag.appendChild(buildField(f)));
    injectStyleOnce();
    frag.appendChild(buildCard());
    if (anchor) cont.insertBefore(frag, anchor); else cont.appendChild(frag);
    renderCard();
    refreshVault();
    wireCardRefresh();
    return true;
  }

  function selText(id) {
    const e = document.getElementById(id);
    if (!e || e.selectedIndex < 0 || !e.value) return "";
    return e.options[e.selectedIndex].text || "";
  }

  function collect() {
    const out = {};
    // each block is isolated: one broken field can never stop the rest from saving
    try {
      FIELDS.forEach((f) => {
        const e = document.getElementById(elId(f.key));
        if (!e) return;
        out[f.key] = f.type === "checkbox" ? !!e.checked : String(e.value == null ? "" : e.value).trim();
      });
    } catch (err) { console.warn("[NCL] fields collect failed", err); }
    try {
      out.categoryText = selText("castecategory");
      out.casteText = selText("caste");
      out.subcasteText = selText("subcaste");
      out.ncl_centralCasteText = selText(elId("ncl_centralCaste"));   // was selTest() - a typo that made EVERY NCL field fail to save
    } catch (err) { console.warn("[NCL] text collect failed", err); }
    return out;
  }

  function restore(entry) {
    FIELDS.forEach((f) => {
      const e = document.getElementById(elId(f.key));
      if (!e) return;
      const v = entry ? entry[f.key] : undefined;
      if (f.type === "checkbox") {
        e.checked = v === undefined ? !!f.def : (v === true || v === "1" || v === "true");
      } else if (f.type === "subselect") {
        setSubOptions(e, [], v == null ? "" : String(v));
      } else {
        e.value = v == null ? (f.type === "select" ? f.opts[0][0] : "") : v;
      }
    });
    renderCard();
  }

  const origRead = typeof window.readForm === "function" ? window.readForm : null;
  if (origRead) {
    window.readForm = function () {
      const o = origRead.apply(this, arguments);
      try { Object.assign(o, collect()); } catch (e) { console.warn("[NCL] collect failed", e); }
      return o;
    };
  }

  const origLoad = typeof window.loadEntry === "function" ? window.loadEntry : null;
  if (origLoad) {
    window.loadEntry = async function (id) {
      const r = await origLoad.apply(this, arguments);
      try {
        const entries = (await storage.get("formEntries")) || [];
        const entry = entries.find((x) => x.id === id);
        if (entry) { restore(entry); refreshSubCasteList(); }
        refreshVault();
      } catch (e) { console.warn("[NCL] restore failed", e); }
      return r;
    };
  }

  function setSubOptions(sel, list, keep) {
    sel.innerHTML = "";
    const first = document.createElement("option");
    first.value = ""; 
    first.textContent = "Please Select";
    sel.appendChild(first);
    
    const seen = new Set();
    list.forEach(([v, t]) => {
      if (!t || seen.has(t)) return;
      seen.add(t);
      const o = document.createElement("option");
      o.value = t; 
      o.textContent = t;
      sel.appendChild(o);
    });
    if (keep && !seen.has(keep)) {
      const o = document.createElement("option");
      o.value = keep; 
      o.textContent = keep;
      sel.appendChild(o);
    }
    sel.value = keep || "";
  }

  function refreshSubCasteList() {
    try {
      const sel = document.getElementById(elId("ncl_centralSubCaste"));
      const cs = document.getElementById(elId("ncl_centralCaste"));
      if (!sel || !cs) return;
      const keep = sel.value;
      if (!cs.value) {
        setSubOptions(sel, [], "");
        sel.title = "Pehle upar [Central] जाति chunein.";
        return;
      }
      const bundled = bundledSubs(cs.value);
      const apply = (learned) => {
        const seen = new Set(bundled.map((x) => subKey(x[1])));
        const extra = (learned || []).filter((x) => x && x[1] && !seen.has(subKey(x[1])));
        const list = bundled.concat(extra);
        const names = list.map((x) => x[1]);
        setSubOptions(sel, list, (!list.length || names.indexOf(keep) >= 0) ? keep : "");
        sel.title = "";
      };
      if (!(window.chrome && chrome.storage && chrome.storage.local)) { apply([]); return; }
      chrome.storage.local.get("nclCentralSubCastes", (r) => {
        apply((r && r.nclCentralSubCastes && r.nclCentralSubCastes[cs.value]) || []);
      });
    } catch (e) { /* ignore */ }
  }

  try {
    if (window.chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === "local" && ch.nclCentralSubCastes) refreshSubCasteList();
      });
    }
  } catch (e) { /* ignore */ }

  // ---- live hints for DOB / Aadhaar (delegated, so it survives the form being re-injected) ----
  function validDob(v) {
    const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(v);
    if (!m) return false;
    const d = +m[1], mo = +m[2], y = +m[3];
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && dt <= new Date() && y >= 1900;
  }
  function flag(el, msg) {
    el.style.outline = msg ? "2px solid #dc2626" : "";
    el.title = msg || "";
    let hint = el.parentElement && el.parentElement.querySelector(".ncl-hint");
    if (msg) {
      if (!hint) { hint = document.createElement("div"); hint.className = "ncl-hint"; hint.style.cssText = "font-size:11px;color:#b91c1c;margin-top:3px;font-weight:600;"; el.insertAdjacentElement("afterend", hint); }
      hint.textContent = msg;
    } else if (hint) hint.remove();
  }
  document.addEventListener("focusout", function (e) {
    const el = e.target;
    if (!el || !el.id) return;
    const v = String(el.value || "").trim();
    if (el.id === elId("ncl_dob")) flag(el, v && !validDob(v) ? "तारीख सही नहीं (DD/MM/YYYY)" : "");
    else if (el.id === elId("ncl_aadhaar")) {
      const digits = v.replace(/\D/g, "");
      let msg = "";
      if (v && digits.length !== 12) msg = "आधार 12 अंक का होना चाहिए";
      else if (digits.length === 12 && typeof window.saathiVerhoeffValid === "function" && !window.saathiVerhoeffValid(digits)) msg = "आधार नंबर का checksum गलत है - दोबारा देखें";
      flag(el, msg);
    }
  });

  function init() {
    if (!inject()) return;
    const cs = document.getElementById(elId("ncl_centralCaste"));
    if (cs && !cs.dataset.nclWired) {
      cs.dataset.nclWired = "1";
      cs.addEventListener("change", refreshSubCasteList);
    }
    const form = document.getElementById("dataForm");
    if (form && window.MutationObserver) {
      new MutationObserver(function () { inject(); }).observe(form, { childList: true, subtree: false });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  setTimeout(init, 400);
})();