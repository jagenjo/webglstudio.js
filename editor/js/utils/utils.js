/* Some Array useful functions (also encoding) */

/* pretty print of an array, no matter if it is typed, and clamping decimals*/
function arrayToString(a, start_tag, end_tag)
{
	start_tag = start_tag || "";
	end_tag = end_tag || "";

	var str = "";
	for(var i in a)
		str += start_tag + a[i].toFixed(3) + end_tag + ",";
	return str.substr(0,str.length-1);
}

function typedArrayToString(array)
{
	var r = "";
	for(var i = 0; i < array.length; i++)
		if (array[i] == 0)
			break;
		else
			r += String.fromCharCode( array[i] );
	return r;
}

/* transform an string into a js array */
function stringToArray(a)
{
	var array = a.split(",");
	for(var i in array)
		array[i] = parseFloat( array[i] );
	return array;
}

/* transform an string into a typed-array */
function stringToTypedArray(str, length)
{
	var r = new Uint8Array( length ? length : str.length);
	for(var i = 0; i < str.length; i++)
		r[i] = str.charCodeAt(i);
	return r;
}

/* transform a typed array in a js array */
function typedArrayToArray(array)
{
	var r = [];
	r.length = array.length;
	for(var i = 0; i < array.length; i++)
		r[i] = array[i];
	return r;
}

/* transform an array in this form: [[1,2],[3,4]] in a typed array: [1,2,3,4]*/
function linearizeArray(array, typed_array_class)
{
	typed_array_class = typed_array_class || Float32Array;
	var components = array[0].length;
	var size = array.length * components;
	var buffer = new typed_array_class(size);

	for (var i=0; i < array.length;++i)
		for(var j=0; j < components; ++j)
			buffer[i*components + j] = array[i][j];
	return buffer;
}


/* Some encoding and decoding tools */
//****** ENCODE in base 64 *******************

var keyStr = "ABCDEFGHIJKLMNOP" +
                "QRSTUVWXYZabcdef" +
                "ghijklmnopqrstuv" +
                "wxyz0123456789+/" +
                "=";

function encode64(input) {
  var output = "";
  var chr1, chr2, chr3 = "";
  var enc1, enc2, enc3, enc4 = "";
  var i = 0;

  do {
	 chr1 = input.charCodeAt(i++);
	 chr2 = input.charCodeAt(i++);
	 chr3 = input.charCodeAt(i++);

	 enc1 = chr1 >> 2;
	 enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
	 enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
	 enc4 = chr3 & 63;

	 if (isNaN(chr2)) {
		enc3 = enc4 = 64;
	 } else if (isNaN(chr3)) {
		enc4 = 64;
	 }

	 output = output +
		keyStr.charAt(enc1) +
		keyStr.charAt(enc2) +
		keyStr.charAt(enc3) +
		keyStr.charAt(enc4);
	 chr1 = chr2 = chr3 = "";
	 enc1 = enc2 = enc3 = enc4 = "";
  } while (i < input.length);

  return output;
}

function encode64Array(input) {
  var output = "";
  var chr1, chr2, chr3 = "";
  var enc1, enc2, enc3, enc4 = "";
  var i = 0;

  do {
	 chr1 = input[i++];
	 chr2 = input[i++];
	 chr3 = input[i++];

	 enc1 = chr1 >> 2;
	 enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
	 enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
	 enc4 = chr3 & 63;

	 if (isNaN(chr2)) {
		enc3 = enc4 = 64;
	 } else if (isNaN(chr3)) {
		enc4 = 64;
	 }

	 output = output +
		keyStr[enc1] +
		keyStr[enc2] +
		keyStr[enc3] +
		keyStr[enc4];
	 chr1 = chr2 = chr3 = "";
	 enc1 = enc2 = enc3 = enc4 = "";
  } while (i < input.length);

  return output;
}

function decode64(input)
{
	 var output = "";
	 var chr1, chr2, chr3 = "";
	 var enc1, enc2, enc3, enc4 = "";
	 var i = 0;
 
	 // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
	 var base64test = /[^A-Za-z0-9\+\/\=]/g;
	 if (base64test.exec(input)) {
		alert("There were invalid base64 characters in the input text.\n" +
			  "Valid base64 characters are A-Z, a-z, 0-9, '+', '/',and '='\n" +
			  "Expect errors in decoding.");
	 }
	 input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
 
	 do {
		enc1 = keyStr.indexOf(input.charAt(i++));
		enc2 = keyStr.indexOf(input.charAt(i++));
		enc3 = keyStr.indexOf(input.charAt(i++));
		enc4 = keyStr.indexOf(input.charAt(i++));
 
		chr1 = (enc1 << 2) | (enc2 >> 4);
		chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
		chr3 = ((enc3 & 3) << 6) | enc4;
 
		output = output + String.fromCharCode(chr1);
 
		if (enc3 != 64) {
		   output = output + String.fromCharCode(chr2);
		}
		if (enc4 != 64) {
		   output = output + String.fromCharCode(chr3);
		}
 
		chr1 = chr2 = chr3 = "";
		enc1 = enc2 = enc3 = enc4 = "";
 
	 } while (i < input.length);
 
	 return unescape(output);
}

function decode64ToArray(input)
{
	 var output = new Uint8Array( input.length );

	 var chr1, chr2, chr3 = "";
	 var enc1, enc2, enc3, enc4 = "";
	 var i = 0;
 
	 // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
	 var base64test = /[^A-Za-z0-9\+\/\=]/g;
	 if (base64test.exec(input)) {
		alert("There were invalid base64 characters in the input text.\n" +
			  "Valid base64 characters are A-Z, a-z, 0-9, '+', '/',and '='\n" +
			  "Expect errors in decoding.");
	 }
	 input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
	 var pos = 0;
 
	 do {
		enc1 = keyStr.indexOf(input.charAt(i++));
		enc2 = keyStr.indexOf(input.charAt(i++));
		enc3 = keyStr.indexOf(input.charAt(i++));
		enc4 = keyStr.indexOf(input.charAt(i++));
 
		chr1 = (enc1 << 2) | (enc2 >> 4);
		chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
		chr3 = ((enc3 & 3) << 6) | enc4;
 
		output[pos++] = chr1;
 
		if (enc3 != 64) {
		   output[pos++] = chr2;
		}
		if (enc4 != 64) {
		   output[pos++] = chr3;
		}
 
		chr1 = chr2 = chr3 = "";
		enc1 = enc2 = enc3 = enc4 = "";
 
	 } while (i < input.length);

	 return output.subarray(0, pos);
}


//***** Encode in Hex *********************

function hexEncode(data){
	var b16_digits = '0123456789abcdef';
	var b16_map = new Array();
	for (var i=0; i<256; i++) {
		b16_map[i] = b16_digits.charAt(i >> 4) + b16_digits.charAt(i & 15);
	}
	
	var result = new Array();
	for (var i=0; i<data.length; i++) {
		result[i] = b16_map[data.charCodeAt(i)];
	}
	
	return result.join('');
}


function hexEncodeArray(data){
	var b16_digits = '0123456789abcdef';
	var b16_map = new Array();
	for (var i=0; i<256; i++) {
		b16_map[i] = b16_digits.charAt(i >> 4) + b16_digits.charAt(i & 15);
	}
	
	var result = new Array();
	for (var i=0; i<data.byteLength; i++) {
		result[i] = b16_map[data[i]];
	}
	
	return result.join('');
}


