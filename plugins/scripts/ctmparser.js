//this is a file that is not included in the config.json, the purpose is to test the CTM Parser

//http://fractalfantasy.net/#/4/uncanny_valley
//http://fractalfantasy.net/uncannyvalley/assets/Head_03.ctm
//http://fractalfantasy.net/uncannyvalley/assets/Head_03_Colour_2K.jpg
//http://fractalfantasy.net/uncannyvalley/assets/Head_03_Gloss_2k.jpg
//http://fractalfantasy.net/uncannyvalley/assets/Head_03_Bump_2K.jpg

var CTMParser = {

	name: "ctmparser",
	type: "mesh",
	format: "text",
	dataType:'text',
	mimeType: "text/plain; charset=x-user-defined",

	init: function()
	{
		/*
		LiteGUI.requireScript([], inner );

		function retrieve(url, callback){
			var request = new XMLHttpRequest();
			request.open("GET", url, true);
			request.overrideMimeType("text/plain; charset=x-user-defined");
			request.send();
			request.onload = callback;
			return request;
		};

		function inner()
		{
			//var request = retrieve("url to ctm file to test", loaded );
		}
		*/
	},

	deinit: function()
	{
	},

	showDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_daylight", {title:"Day light editor", close: true, width: 300, height: 120, scroll: false, draggable: true});
		dialog.show('fade');
	},

	parse: function(data)
	{
		var stream = new CTM.Stream(data);
		var file = new CTM.File(stream);
		if(!file)
			return;
		console.log( file );
		var mesh = GL.Mesh.load({ vertices: file.body.vertices, triangles: file.body.indices, normals: file.body.normals, coords: file.body.uvMaps[0].uv });
		LS.RM.registerResource( "test.ctm", mesh );
		console.log("Mesh registered");
		return mesh;
	}
}

LS.Network.requestScript("js/plugins/extra/lzma.js");
LS.Network.requestScript("js/plugins/extra/ctm.js");
LS.Formats.addSupportedFormat( "ctm", CTMParser );


