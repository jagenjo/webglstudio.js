//this is a file that is not included in the config.json, the purpose is to test the 

//http://fractalfantasy.net/#/4/uncanny_valley
//http://fractalfantasy.net/uncannyvalley/assets/Head_03.ctm
//http://fractalfantasy.net/uncannyvalley/assets/Head_03_Bump_2K.jpg
//http://fractalfantasy.net/uncannyvalley/assets/Head_03_Colour_2K.jpg
//http://fractalfantasy.net/uncannyvalley/assets/Head_03_Gloss_2k.jpg

var CTMParser = {

	name: "ctmparser",

	init: function()
	{
		LiteGUI.requireScript(["js/plugins/extra/lzma.js","js/plugins/extra/ctm.js"], inner );

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
			var request = retrieve("http://www.tamats.com/uploads/bigdata/Head_03.ctm", loaded );
		}

		function loaded(data)
		{
			var response = this.response;
			var stream = new CTM.Stream(response);
			var file = new CTM.File(stream);
			if(!file)
				return;
			console.log( file );
			var mesh = GL.Mesh.load({ vertices: file.body.vertices, triangles: file.body.indices, normals: file.body.normals, coords: file.body.uvMaps[0].uv });
			LS.RM.registerResource( "head.ctm", mesh );
			console.log("Mesh registered");
		}
	},

	deinit: function()
	{
	},

	showDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_daylight", {title:"Day light editor", close: true, width: 300, height: 120, scroll: false, draggable: true});
		dialog.show('fade');
	}
}

CORE.registerModule( CTMParser );
