# LutiMcMurdo

A container app for iOS to allow https://lifeundertheice.org to run from an offline copy.

## Data prep

Using a copy of https://github.com/spacehackers/luti and an offline copy of the Amazon S3 bucket of videos, make a zip file containing a static copy of the LUTI website.

## react-native-static-server-setenv.patch

Apply this patch to include mod_setenv in the webserver built by @dr.pogodin/react-native-static-server. This allows setting Access-Control-Allow-Origin so that HLS video can be served from the internal server to the app.
